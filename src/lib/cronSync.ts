import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

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

                if (ccs.length > 1) {
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                const rateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.rateio_centro_custo && r.valor) {
                                        r.rateio_centro_custo.forEach((rc: any) => {
                                            // The rateio JSON provides absolute values for the entire event.
                                            // We calculate the percentage and apply it to THIS individual installment!
                                            const percent = (rc.valor || 0) / r.valor;
                                            const proportionalValue = (item.total || item.valor || 0) * percent;
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + proportionalValue);
                                        });
                                    }
                                });
                                // Deduplicate CCs by ID and sum their values to prevent doubling
                                const uniqueCcsMap = new Map();
                                ccs.forEach((cc: any) => {
                                    const val = rateioMap.has(cc.id) ? rateioMap.get(cc.id) : cc.valor;
                                    uniqueCcsMap.set(cc.id, (uniqueCcsMap.get(cc.id) || 0) + val);
                                });
                                
                                ccs = Array.from(uniqueCcsMap.entries()).map(([id, valor]) => ({
                                    id,
                                    valor
                                }));
                            }
                        }
                    } catch(e) {}
                }

                let dateStr: string;
                let amount: number;

                if (viewMode === 'caixa') {
                    // Cash mode: CA API uses "ACQUITTED" status (not PAGO) for paid items.
                    // There is NO data_pagamento field in this CA endpoint.
                    // "pago" = amount paid (>0 means settled), "data_vencimento" = best available date proxy.
                    if (!item.pago || item.pago <= 0) continue;
                    dateStr = item.data_vencimento;
                    amount = item.pago;
                } else {
                    // Accrual mode: Prioritize competence date, then due date
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                    amount = item.total || item.valor_original || item.valor || item.valor_liquido || 0;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                if (dateObj.getFullYear() !== targetYear) continue;

                transactions.push({
                    id: item.id,
                    month: dateObj.getMonth(), // 0-11
                    amount: Math.abs(amount),
                    categories: cats,
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

export async function runCronSync(reqYear: number) {
    const allTenants = (await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } }));
    console.log(`[SYNC] Found ${allTenants.length} tenants in total.`);
    if (allTenants.length === 0) {
        return { success: false, error: 'No tenants' };
    }

    // DEDUPLICATE: Only sync once per unique company name/CNPJ (even if multiple DB rows exist)
    const seenKeys = new Set();
    const tenants = allTenants.filter(t => {
        const cleanName = (t.name || '').trim().toUpperCase();
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const key = `${cleanName}-${cleanCnpj}`;
        
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });

    const report = [];

    for (const t of tenants) {
        let token: string;
        try {
            console.log(`[SYNC] [${t.name}] Starting sync for year ${reqYear}...`);
            const res = await getValidAccessToken(t.id);
            token = res.token;
        } catch (e: any) {
            report.push({ tenant: t.name, status: `Token Error: ${e.message}` });
            continue;
        }
        report.push({ tenant: t.name, status: `In Progress` });


        // Fetch valid IDs to prevent Foreign Key Constraint errors from deleted items on Conta Azul
        const validCategories = new Set((await prisma.category.findMany({ where: { tenantId: t.id }, select: { id: true } })).map(c => c.id));
        const validCostCenters = new Set((await prisma.costCenter.findMany({ where: { tenantId: t.id }, select: { id: true } })).map(c => c.id));

        for (const viewMode of ['competencia', 'caixa'] as const) {
            // Widen the search window by 2 months before/after to catch Competência vs Caixa mismatches,
            // without blowing up Conta Azul's backend with a 500 error on large 3-year requests.
            const startStr = `${reqYear - 1}-11-01`;
            const endStr = `${reqYear + 1}-02-28`;
            const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
            const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;

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

                // Amount of this specific installment/transaction
                const totalAmount = txn.amount;
                console.log(`[DEBUG] Processing Txn: ${txn.id} | Amt: ${totalAmount} | Cat: ${txn.categories.map((c:any) => c.name).join(', ')}`);

                // 1. SPLIT BY CATEGORY
                // Conta Azul V2 returns the full chain. We MUST only take the leaf categories 
                // to avoid double counting parent totals.
                const catIds = new Set(txn.categories.map((c: any) => c.id));
                const leaves = txn.categories.filter((c: any) => {
                    // If this category is a parent of ANY other category in this same transaction, it's not a leaf.
                    return !txn.categories.some((other: any) => other.parentId === c.id);
                });

                if (leaves.length === 0 && txn.categories.length > 0) {
                    // Fallback to the first one if we can't find a leaf (shouldn't happen with CA data)
                    leaves.push(txn.categories[0]);
                }

                let totalCatAllocated = 0;
                const catEntries = leaves.map((c: any) => {
                    const val = typeof c.valor === 'number' ? Math.abs(c.valor) : (totalAmount / leaves.length);
                    totalCatAllocated += val;
                    return { id: c.id, amount: val };
                });

                // 2. SPLIT BY COST CENTER PER CATEGORY
                for (const cat of catEntries) {
                    if (!validCategories.has(cat.id)) continue;

                    const catAmount = cat.amount;
                    
                    if (txn.costCenters.length === 0) {
                        const key = `${cat.id}|NONE|${txn.month}`;
                        aggregates.set(key, (aggregates.get(key) || 0) + catAmount);
                    } else {
                        // For each category, we split its partial amount across the CCs
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
                            return { id: cc.id, amount: explicitAmount };
                        });

                        const remainingCcAmount = Math.max(0, catAmount - totalCcAllocated);
                        const fallbackPerCc = unallocatedCount > 0 ? (remainingCcAmount / unallocatedCount) : 0;

                        for (const cc of ccSplits) {
                            const ccId = validCostCenters.has(cc.id) ? cc.id : 'NONE';
                            const key = `${cat.id}|${ccId}|${txn.month}`;
                            const finalCcAmount = cc.amount !== null ? cc.amount : fallbackPerCc;
                            aggregates.set(key, (aggregates.get(key) || 0) + finalCcAmount);
                        }
                    }
                }
            }

            // FIXED: Identification by CNPJ to catch all variants/orphans of this company
            const allEntityIds = (await prisma.tenant.findMany({
                where: { cnpj: t.cnpj },
                select: { id: true }
            })).map(dt => dt.id);
            
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
                    tenantId: t.id,
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
