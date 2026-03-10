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
                                    if (r.rateio_centro_custo) {
                                        r.rateio_centro_custo.forEach((rc: any) => {
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + (rc.valor || 0));
                                        });
                                    }
                                });
                                ccs = ccs.map((cc: any) => ({
                                    ...cc,
                                    valor: rateioMap.has(cc.id) ? rateioMap.get(cc.id) : cc.valor
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
    const tenants = await prisma.tenant.findMany();
    if (tenants.length === 0) {
        return { success: false, error: 'No tenants' };
    }

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
                if (txn.categories.length === 0) continue;

                const ccsCount = txn.costCenters.length || 1;
                const cat = txn.categories[0]; // Mirror exact behavior from services.ts to prevent data shifts

                const amountForCat = txn.amount;
                // amountPerCc is no longer a static division sum, it is calculated per CC below.

                // 2-PASS RATEIO FOR REMAINDERS:
                // First pass: sum explicit allocations to find the remaining balance
                let totalAllocated = 0;
                let unallocatedCount = 0;

                const processedCcs = txn.costCenters.map((cc: any) => {
                    let explicitAmount = null;
                    if (typeof cc.valor === 'number') {
                        explicitAmount = Math.abs(cc.valor);
                    } else if (typeof cc.percentual === 'number') {
                        explicitAmount = amountForCat * (cc.percentual / 100);
                    }

                    if (explicitAmount !== null) {
                        totalAllocated += explicitAmount;
                    } else {
                        unallocatedCount++;
                    }

                    return { ...cc, explicitAmount };
                });

                const remainingAmount = Math.max(0, amountForCat - totalAllocated);
                const fallbackPerCc = unallocatedCount > 0 ? (remainingAmount / unallocatedCount) : 0;


                if (txn.costCenters.length === 0) {
                    const key = `${cat.id}|NONE|${txn.month}`;
                    aggregates.set(key, (aggregates.get(key) || 0) + amountForCat);
                } else {
                    for (const cc of processedCcs) {
                        const key = `${cat.id}|${cc.id}|${txn.month}`;
                        const specificAmount = cc.explicitAmount !== null ? cc.explicitAmount : fallbackPerCc;
                        aggregates.set(key, (aggregates.get(key) || 0) + specificAmount);
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
