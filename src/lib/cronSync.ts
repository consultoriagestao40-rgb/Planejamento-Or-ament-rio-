import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia') {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];

    const rawItems: any[] = [];
    while (hasMore && page <= 50) {
        const url = `${baseUrl}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;
            rawItems.push(...items);
            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) { hasMore = false; }
    }

    // Process items in parallel chunks to save time
    const CHUNK_SIZE = 10;
    for (let i = 0; i < rawItems.length; i += CHUNK_SIZE) {
        const chunk = rawItems.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (item) => {
            if ((item.status || '').toUpperCase().includes('CANCEL')) return;

            let dateStr: string;
            let amount: number;

            if (viewMode === 'caixa') {
                if (!item.pago || item.pago <= 0) return;
                dateStr = item.data_vencimento;
                amount = item.pago;
            } else {
                dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                amount = item.total || item.valor_original || item.valor || item.valor_liquido || 0;
            }

            const dateObj = dateStr ? new Date(dateStr) : new Date();
            if (dateObj.getFullYear() !== targetYear) return;

            const cats = item.categorias || [];
            const ccs = item.centros_de_custo || [];

            // Targeted Deep Extraction: Only if complex or specifically on revenue/tax paths
            const isComplex = cats.length > 0 || ccs.length > 1;
            
            if (isComplex) {
                try {
                    const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { 
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        signal: AbortSignal.timeout(5000) // Don't hang the whole sync
                    });
                    if (pRes.ok) {
                        const pData = await pRes.json();
                        if (pData.evento && pData.evento.rateio && pData.evento.rateio.length > 0) {
                            const deepCats: any[] = [];
                            pData.evento.rateio.forEach((r: any) => {
                                if (r.id_categoria) {
                                    const ccExclusives = (r.rateio_centro_custo || []).map((rc: any) => ({
                                        id: rc.id_centro_custo,
                                        valor: Math.abs(rc.valor || 0),
                                        percentual: rc.percentual
                                    }));
                                    deepCats.push({
                                        id: r.id_categoria,
                                        nome: r.nome_categoria,
                                        valor: Math.abs(r.valor || 0),
                                        centros_de_custo_exclusivos: ccExclusives
                                    });
                                }
                            });
                            if (deepCats.length > 0) {
                                transactions.push({
                                    id: item.id,
                                    month: dateObj.getMonth(),
                                    amount: Math.abs(amount),
                                    categories: deepCats,
                                    costCenters: [],
                                    useExplicitCatValues: true
                                });
                                return;
                            }
                        }
                    }
                } catch(e) {}
            }

            transactions.push({
                id: item.id,
                month: dateObj.getMonth(),
                amount: Math.abs(amount),
                categories: cats,
                costCenters: ccs,
                useExplicitCatValues: false
            });
        }));
    }
    return transactions;
}

export async function runCronSync(reqYear: number) {
    const allTenants = await prisma.tenant.findMany({ orderBy: { tokenExpiresAt: 'desc' } });
    if (allTenants.length === 0) {
        return { success: false, error: 'No tenants' };
    }

    // DEDUPLICATE: Only sync once per unique company name/CNPJ (even if multiple DB rows exist)
    const seenKeys = new Set();
    const tenants = allTenants.filter(t => {
        const superCleanName = (t.name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const key = cleanCnpj || superCleanName;
        
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });

    const report = [];

    for (const t of tenants) {
        let token: string;
        try {
            const res = await getValidAccessToken(t.id);
            token = res.token;
        } catch (e: any) {
            report.push({ tenant: t.name, status: `Token Error: ${e.message}` });
            continue;
        }

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

            const receivables = await fetchAllTransactionsForYear(token, receivablesUrl, reqYear, viewMode);
            const payables = await fetchAllTransactionsForYear(token, payablesUrl, reqYear, viewMode);

            const allTxns = [...receivables, ...payables];

            const aggregates = new Map<string, number>();

            for (const txn of allTxns) {
                const cats = (txn.categories || []) as any[];
                if (cats.length === 0) continue;

                // Conta Azul V1 list API often doesn't provide explicit 'valor' per category.
                const hasExplicitValues = cats.length > 0 && cats.every(c => typeof (c as any).valor === 'number' && (c as any).valor > 0);
                const totalCatsValueSum = hasExplicitValues 
                    ? cats.reduce((sum, c) => sum + Math.abs((c as any).valor || 0), 0) || txn.amount || 1
                    : txn.amount;

                // Process each category in the transaction
                for (const cat of cats) {
                    let amountForThisCat = 0;

                    if ((txn as any).useExplicitCatValues && typeof (cat as any).valor === 'number') {
                        amountForThisCat = (cat as any).valor;
                    } else if (typeof (cat as any).valor === 'number') {
                        amountForThisCat = Math.abs((cat as any).valor);
                    } else {
                        amountForThisCat = txn.amount * (1 / cats.length);
                    }

                    // Use category-specific CCs if deep extraction found them. Otherwise fallback to event CCs.
                    const ccsToProcess = ((cat as any).centros_de_custo_exclusivos && (cat as any).centros_de_custo_exclusivos.length > 0)
                        ? (cat as any).centros_de_custo_exclusivos
                        : txn.costCenters;

                    let totalAllocated = 0;
                    let unallocatedCount = 0;

                    const processedCcs = ccsToProcess.map((cc: any) => {
                        let amountPerCc = null;
                        if (typeof cc.valor === 'number') {
                            amountPerCc = Math.abs(cc.valor); // Exact CC value sent by CA for THIS category
                        } else if (typeof cc.percentual === 'number') {
                            amountPerCc = amountForThisCat * (cc.percentual / 100);
                        }

                        if (amountPerCc !== null) {
                            totalAllocated += amountPerCc;
                        } else {
                            unallocatedCount++;
                        }
                        return { ...cc, amountPerCc };
                    });

                    if (ccsToProcess.length === 0) {
                        const key = `${cat.id}|NONE|${txn.month}`;
                        aggregates.set(key, (aggregates.get(key) || 0) + amountForThisCat);
                    } else {
                        for (const cc of processedCcs) {
                            const key = `${cat.id}|${cc.id}|${txn.month}`;
                            const specificAmount = cc.amountPerCc !== null ? cc.amountPerCc : (unallocatedCount > 0 ? (Math.max(0, amountForThisCat - totalAllocated) / unallocatedCount) : 0);
                            aggregates.set(key, (aggregates.get(key) || 0) + specificAmount);
                        }
                    }
                }
            }

            await prisma.realizedEntry.deleteMany({
                where: { tenantId: t.id, year: reqYear, viewMode }
            });

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
