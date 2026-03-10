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

                if (ccs.length > 1 || cats.length > 1) { // Deep extraction also needed for multi-category splits
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                // Augment Categories with explicit values from the API!
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.id_categoria && r.valor) {
                                        const targetCat = cats.find((c: any) => c.id === r.id_categoria);
                                        if (targetCat) targetCat.valor = r.valor;
                                    }
                                });

                                const eventTotalSum = pData.evento.rateio.reduce((sum: number, rat: any) => sum + Math.abs(rat.valor || 0), 0) || 1;
                                const rateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.rateio_centro_custo && r.valor) {
                                        r.rateio_centro_custo.forEach((rc: any) => {
                                            // global percent of this CC in the context of the whole event
                                            const globalPercent = (rc.valor || 0) / eventTotalSum;
                                            const proportionalValue = (item.total || item.valor || 0) * globalPercent;
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + proportionalValue);
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
                    let catRatio = 0;
                    let amountForThisCat = 0;

                    if (hasExplicitValues) {
                        amountForThisCat = Math.abs((cat as any).valor || 0);
                        catRatio = amountForThisCat / totalCatsValueSum; // To distribute CCs relative to this category's size
                    } else {
                        catRatio = 1 / cats.length;
                        amountForThisCat = txn.amount * catRatio;
                    }

                    // 2-PASS RATEIO FOR CCs (Applying the catRatio to explicit CC amounts)
                    let totalAllocated = 0;
                    let unallocatedCount = 0;

                    const processedCcs = txn.costCenters.map((cc: any) => {
                        let amountPerCc = null;
                        if (typeof cc.valor === 'number') {
                            amountPerCc = Math.abs(cc.valor) * catRatio;
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

                    const remainingAmount = Math.max(0, amountForThisCat - totalAllocated);
                    const fallbackPerCc = unallocatedCount > 0 ? (remainingAmount / unallocatedCount) : 0;

                    if (txn.costCenters.length === 0) {
                        const key = `${cat.id}|NONE|${txn.month}`;
                        aggregates.set(key, (aggregates.get(key) || 0) + amountForThisCat);
                    } else {
                        for (const cc of processedCcs) {
                            const key = `${cat.id}|${cc.id}|${txn.month}`;
                            const specificAmount = cc.amountPerCc !== null ? cc.amountPerCc : fallbackPerCc;
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
