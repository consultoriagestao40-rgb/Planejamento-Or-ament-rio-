import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { getPrimaryTenantId, getAllVariantIds } from '@/lib/tenant-utils';

async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia') {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];

    while (hasMore && page <= 50) {
        const url = `${baseUrl}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) {
                console.error(`Cron API fetch error ${res.status} on ${url}`);
                break;
            }

            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;

            for (const item of items) {
                if ((item.status || '').toUpperCase().includes('CANCEL')) continue;

                const cats = item.categorias || [];
                let ccs = item.centros_de_custo || [];

                // Se houver rateio (centro de custo OU múltiplas categorias), buscamos detalhes
                if (ccs.length > 1 || cats.length > 1) {
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                // 1. RATEIO POR CATEGORIA (PARA VALOR BRUTO)
                                const catRateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.id_categoria) {
                                        catRateioMap.set(r.id_categoria, (catRateioMap.get(r.id_categoria) || 0) + (r.valor || 0));
                                    }
                                });
                                // Injetar valores reais nas categorias do item para o loop de agregacao
                                cats.forEach((c: any) => {
                                    if (catRateioMap.has(c.id)) {
                                        c.valor = catRateioMap.get(c.id);
                                    }
                                });

                                // 2. RATEIO POR CENTRO DE CUSTO
                                const rateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.rateio_centro_custo && r.valor) {
                                        r.rateio_centro_custo.forEach((rc: any) => {
                                            const percent = (rc.valor || 0) / r.valor;
                                            const proportionalValue = (item.total || item.valor || 0) * percent;
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + proportionalValue);
                                        });
                                    }
                                });
                                const uniqueCcsMap = new Map();
                                ccs.forEach((cc: any) => {
                                    const val = rateioMap.has(cc.id) ? rateioMap.get(cc.id) : cc.valor;
                                    uniqueCcsMap.set(cc.id, (uniqueCcsMap.get(cc.id) || 0) + val);
                                });
                                ccs = Array.from(uniqueCcsMap.entries()).map(([id, valor]) => ({ id, valor }));
                            }
                        }
                    } catch(e) {}
                }

                let dateStr: string;
                let amount: number;

                if (viewMode === 'caixa') {
                    // Regime de Caixa: Priorizar data_pagamento ou baixar_em.
                    // A API V2 as vezes retorna data_pagamento na parcela ou no evento após a baixa.
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    
                    // Consider paid if it has a payment amount or a positive paid value
                    const status = (item.status || '').toUpperCase();
                    const isPaid = status === 'BAIXADO' || status === 'RECEBIDO' || status === 'PAGO' || status === 'QUITADO' || (item.pago && item.pago > 0) || (item.valor_pago && item.valor_pago > 0);
                    if (!isPaid) continue;
                    
                    // CRITICAL FIX: Prioritize payment amount or installment value over SALE TOTAL
                    amount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                } else {
                    // Regime de Competência: EXTREMAMENTE ESTRITO
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                    // Use a soma dos pagos/brutos se disponível, ou o valor da parcela
                    amount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                // Validar se o ano corresponde ao solicitado
                if (dateObj.getFullYear() !== targetYear) continue;

                transactions.push({
                    id: item.id,
                    description: item.descricao,
                    month: dateObj.getMonth(), // 0-11
                    amount: Math.abs(amount),
                    categories: cats, // These now have the corrected values from rateio detail
                    costCenters: ccs
                });
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) {
            hasMore = false;
        }
    }
    return transactions;
}

export async function runCronSync(reqYear: number, targetTenantId?: string) {
    let allTenants;
    if (targetTenantId && targetTenantId !== 'ALL') {
        allTenants = await prisma.tenant.findMany({ where: { id: targetTenantId } });
    // DEDUPLICATE: Only sync once per UNIQUE COMPANY (CNPJ or Normalized Name)
    const companyMap = new Map();
    allTenants.forEach(t => {
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
        // Keep the one with the most recent update
        if (!companyMap.has(key) || new Date(t.updatedAt) > new Date(companyMap.get(key).updatedAt)) {
            companyMap.set(key, t);
        }
    });

    const tenants = Array.from(companyMap.values());
    console.log(`[SYNC] Processing ${tenants.length} unique companies out of ${allTenants.length} tenants.`);

    const report = [];

    for (const t of tenants) {
        let token: string = '';
        try {
            console.log(`[SYNC] [${t.name}] Starting sync for year ${reqYear}...`);
            const res = await getValidAccessToken(t.id);
            token = res.token;
        } catch (e: any) {
            report.push({ tenant: t.name, status: `Token Error: ${e.message}` });
            continue;
        }

        // IMPORTANT: Use the deduplicated tenant's ID as the source of truth
        const primaryId = t.id; 
        const allEntityIds = await getAllVariantIds(t.id);
        
        console.log(`[SYNC] [${t.name}] Primary ID: ${primaryId} | Variants to clean: ${allEntityIds.length}`);

        // Fetch valid IDs using the PRIMARY tenant context
        const validCategories = new Set((await prisma.category.findMany({ where: { tenantId: primaryId }, select: { id: true } })).map((c: any) => c.id));
        const validCostCenters = new Set((await prisma.costCenter.findMany({ where: { tenantId: primaryId }, select: { id: true } })).map((c: any) => c.id));

        for (const viewMode of ['competencia', 'caixa'] as const) {
            const isCaixa = viewMode === 'caixa';
            const startStr = isCaixa ? `${reqYear}-01-01` : `${reqYear - 1}-07-01`;
            const endStr = isCaixa ? `${reqYear}-12-31` : `${reqYear + 1}-06-30`;
            const dateParam = isCaixa ? 'data_pagamento' : 'data_vencimento';

            const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`;
            const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`;

            console.log(`[SYNC] [${t.name}] Fetching transactions for mode: ${viewMode}...`);
            const receivables = await fetchAllTransactionsForYear(token, receivablesUrl, reqYear, viewMode);
            const payables = await fetchAllTransactionsForYear(token, payablesUrl, reqYear, viewMode);
            console.log(`[SYNC] [${t.name}] Found ${receivables.length} receivables and ${payables.length} payables.`);


            const allTxns = [...receivables, ...payables];
            const aggregates = new Map<string, number>();

            // IDEMPOTENCY: Use a set to track already processed IDs within this viewMode loop
            const processedIds = new Set<string>();

            for (const txn of allTxns) {
                // Deduplicate by full ID to handle installments correctly as separate records
                if (processedIds.has(txn.id)) continue;
                processedIds.add(txn.id);

                if (txn.categories.length === 0) continue;

                // Quantidade deste item específico
                const totalAmount = txn.amount;

                // 1. SPLIT BY CATEGORY
                // Conta Azul V2 returns the full chain. We MUST only take the leaf categories 
                // to avoid double counting parent totals.
                const leaves = txn.categories.filter((c: any) => {
                    const cid = c.id;
                    const hasChild = txn.categories.some((other: any) => 
                        (other.parent_id === cid) || 
                        (other.parentId === cid) || 
                        (other.category_parent_id === cid)
                    );
                    return !hasChild;
                });

                // DETAILED LOG FOR SPOT JAN 2026 (Competencia)
                if (t.name.includes('SPOT') && txn.month === 0 && !isCaixa) {
                    console.log(`[SPOT-AUDIT-JAN] Txn: ${txn.id} | Amount: ${txn.amount} | Description: ${txn.description || 'N/A'}`);
                    leaves.forEach((l: any) => console.log(`  -> Leaf: ${l.name} (${l.id}) | Val: ${l.valor}`));
                }

                if (leaves.length === 0 && txn.categories.length > 0) {
                    leaves.push(txn.categories[0]);
                }

                let totalCatAllocated = 0;
                const catEntries = leaves.map((c: any) => {
                    // Use the CATEGORY ABSOLUTE VALUE from rateio detail if it's there (Gross DRE)
                    // If not, divide the item total (pago/valor) proportionally
                    let val = typeof c.valor === 'number' ? Math.abs(c.valor) : (totalAmount / leaves.length);
                    
                    // AUDIT: If it's Venda 649, we expect it to be 6259 eventually
                    if (txn.description?.includes('649')) {
                         console.log(`[SYNC-649-BREAKDOWN] Cat: ${c.name} | Raw Val: ${c.valor} | Final Val: ${val}`);
                    }

                    totalCatAllocated += val;
                    return { id: `${primaryId}:${c.id}`, amount: val };
                });

                // 2. SPLIT BY COST CENTER PER CATEGORY
                for (const cat of catEntries) {
                    if (!validCategories.has(cat.id)) continue;

                    const catAmount = cat.amount;
                    
                    if (txn.costCenters.length === 0) {
                        const key = `${cat.id}|NONE|${txn.month}`;
                        aggregates.set(key, (aggregates.get(key) || 0) + catAmount);
                    } else {
                        // Para cada categoria, dividimos o valor parcial entre os centros de custo
                        let totalCcAllocated = 0;
                        let unallocatedCount = 0;

                        const ccSplits = txn.costCenters.map((cc: any) => {
                            let explicitAmount = null;
                            if (typeof cc.valor === 'number') {
                                explicitAmount = Math.abs(cc.valor);
                            } else if (typeof cc.percentual === 'number') {
                                explicitAmount = catAmount * (cc.percentual / 100);
                            }

                            if (explicitAmount !== null) {
                                totalCcAllocated += explicitAmount;
                            } else {
                                unallocatedCount++;
                            }
                            return { id: `${primaryId}:${cc.id}`, amount: explicitAmount }; // Use PRIMARY IDs
                        });

                        const remainingCcAmount = Math.max(0, catAmount - totalCcAllocated);
                        const fallbackPerCc = unallocatedCount > 0 ? (remainingCcAmount / unallocatedCount) : 0;

                        for (const cc of ccSplits) {
                            const ccId = validCostCenters.has(cc.id) ? cc.id : 'NONE';
                            const key = `${cat.id}|${ccId}|${txn.month}`;
                            const finalCcAmount = cc.amount !== null ? cc.amount : (unallocatedCount > 0 ? fallbackPerCc : (catAmount / ccSplits.length));
                            aggregates.set(key, (aggregates.get(key) || 0) + finalCcAmount);
                        }
                    }
                }
            }

            // FIXED: Identification by CNPJ to catch all variants/orphans of this company
            const allEntityIds = (await prisma.tenant.findMany({
                where: { cnpj: t.cnpj },
                select: { id: true }
            })).map((dt: any) => dt.id);
            
            console.log(`[SYNC] [${t.name}] Cleaning up entries for IDs: ${allEntityIds.join(', ')} | Mode: ${viewMode} | Year: ${reqYear} | CNPJ: ${t.cnpj}`);
            const delRes = await prisma.realizedEntry.deleteMany({
                where: { tenantId: { in: allEntityIds }, year: reqYear, viewMode }
            });
            console.log(`[SYNC] [${t.name}] Deleted ${delRes.count} legacy entries for ${viewMode}`);

            const createData = [];
            for (const [key, amount] of aggregates.entries()) {
                const [categoryId, costCenterId, monthStr] = key.split('|');

                // Filter out invalid foreign keys (deleted categories/CCs that still appear in historical CA transactions)
                if (!validCategories.has(categoryId)) continue;
                if (costCenterId !== 'NONE' && !validCostCenters.has(costCenterId)) continue;

                createData.push({
                    tenantId: primaryId, // Force data into the primary record
                    categoryId,
                    costCenterId: costCenterId === 'NONE' ? null : costCenterId,
                    month: parseInt(monthStr, 10),
                    year: reqYear,
                    amount,
                    viewMode
                });
            }

            if (createData.length > 0) {
                try {
                    await prisma.realizedEntry.createMany({ data: createData });
                } catch (batchError) {
                    console.error(`Batch insert failed for ${viewMode}. Falling back to individual inserts...`);
                    // Robust Fallback: If one ghost ID skips our filter and ruins the batch, insert the rest manually.
                    let successCount = 0;
                    let failCount = 0;
                    for (const row of createData) {
                        try {
                            await prisma.realizedEntry.create({ data: row });
                            successCount++;
                        } catch (singleError: any) {
                            failCount++;
                            console.error(`Skipped invalid RealizedEntry row: cat=${row.categoryId} cc=${row.costCenterId}. Error: ${singleError.message}`);
                        }
                    }
                    console.log(`Fallback complete: ${successCount} inserted, ${failCount} skipped.`);
                }
            }
        }
        report.push({ tenant: t.name, status: 'Success' });
    }

    return { success: true, year: reqYear, report };
}
