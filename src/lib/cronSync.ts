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

            items.forEach((item: any) => {
                if ((item.status || '').toUpperCase().includes('CANCEL')) return;

                const cats = item.categorias || [];
                const ccs = item.centros_de_custo || [];

                let dateStr: string;
                let amount: number;

                if (viewMode === 'caixa') {
                    // Cash mode: STRICTLY require a payment date. If not paid, it's not cash flow.
                    if (!item.data_pagamento) return;
                    dateStr = item.data_pagamento;
                    amount = item.valor || item.valor_liquido || item.valor_original || item.total || 0;
                } else {
                    // Accrual mode: Prioritize competence date, then due date
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento || item.data_pagamento;
                    amount = item.total || item.valor_original || item.valor || item.valor_liquido || 0;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                
                // Adjust for timezones strictly so a "2026-06-01T00:00:00Z" falls in month 5, not month 4 in BRT
                const splitDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
                const [y, m, d] = splitDate.split('T')[0].split('-').map(Number);
                const localDateObj = new Date(y, m - 1, d || 1);

                if (localDateObj.getFullYear() !== targetYear) return;

                transactions.push({
                    id: item.id,
                    month: localDateObj.getMonth(), // 0-11
                    amount: Math.abs(amount), // ALWAYS positive, DRE frontend subtracts expenses
                    categories: cats,
                    costCenters: ccs
                });
            });

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
            // Widen the search window by 2 months before/after to catch Competência vs Caixa mismatches.
            // CAUTION: Conta Azul API requires either data_emissao or data_vencimento for these endpoints.
            // Using data_pagamento directly in the URL query yields empty arrays.
            // For 'caixa', a bill from last year can be paid this year. We must broadly fetch by VENCIMENTO
            // and then filter in TypeScript by data_pagamento.
            let startStr, endStr;
            const filterType = 'data_vencimento';

            if (viewMode === 'caixa') {
                // To find cash flow for 2026, we might need bills that expired in 2025 but were paid in 2026
                // and bills that expire in 2027 but were prepaid in 2026.
                startStr = `${reqYear - 1}-01-01`; 
                endStr = `${reqYear + 1}-12-31`;
            } else {
                startStr = `${reqYear - 1}-11-01`;
                endStr = `${reqYear + 1}-02-28`;
            }

            const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${filterType}_de=${startStr}&${filterType}_ate=${endStr}&tamanho_pagina=100`;
            const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${filterType}_de=${startStr}&${filterType}_ate=${endStr}&tamanho_pagina=100`;

            const receivables = await fetchAllTransactionsForYear(token, receivablesUrl, reqYear, viewMode);
            const payables = await fetchAllTransactionsForYear(token, payablesUrl, reqYear, viewMode);

            const allTxns = [...receivables, ...payables];
            console.log(`[DEBUG] Syncing ${reqYear} ${viewMode} for ${t.name}: ${receivables.length} REC + ${payables.length} PAY = ${allTxns.length} total. Params: ${filterType}`);

            const aggregates = new Map<string, number>();

            for (const txn of allTxns) {
                if (txn.categories.length === 0) continue;

                const ccsCount = txn.costCenters.length || 1;
                const cat = txn.categories[0]; // Mirror exact behavior from services.ts to prevent data shifts

                const amountForCat = txn.amount;
                const amountPerCc = amountForCat / ccsCount;

                if (txn.costCenters.length === 0) {
                    const key = `${cat.id}|NONE|${txn.month}`;
                    aggregates.set(key, (aggregates.get(key) || 0) + amountPerCc);
                } else {
                    for (const cc of txn.costCenters) {
                        const key = `${cat.id}|${cc.id}|${txn.month}`;
                        aggregates.set(key, (aggregates.get(key) || 0) + amountPerCc);
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
