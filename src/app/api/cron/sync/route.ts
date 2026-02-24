import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max on Vercel Pro

async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia', isExpense: boolean) {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];
    const sign = isExpense ? -1 : 1;

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
                    dateStr = item.data_vencimento || item.vencimento || item.data_competencia || item.data_pagamento;
                    amount = item.valor || item.valor_original || item.valor_liquido || item.total || 0;
                } else {
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento || item.data_pagamento;
                    amount = item.total || item.valor_original || item.valor || item.valor_liquido || 0;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                if (dateObj.getFullYear() !== targetYear) return;

                transactions.push({
                    id: item.id,
                    month: dateObj.getMonth(), // 0-11
                    amount: amount * sign,
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

        for (const viewMode of ['competencia', 'caixa'] as const) {
            // To fetch properly from Conta Azul (which filters by due date for APIs) 
            // we widen the window so we don't miss competent items paid next year.
            const start = `${reqYear - 1}-01-01`;
            const end = `${reqYear + 1}-12-31`;

            const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;
            const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;

            const receivables = await fetchAllTransactionsForYear(token, receivablesUrl, reqYear, viewMode, false);
            const payables = await fetchAllTransactionsForYear(token, payablesUrl, reqYear, viewMode, true);

            const allTxns = [...receivables, ...payables];

            // Aggregate by: categoryId | costCenterId | month
            const aggregates = new Map<string, number>();

            for (const txn of allTxns) {
                if (txn.categories.length === 0) continue;

                const ccsCount = txn.costCenters.length || 1;
                const amountPerCc = txn.amount / ccsCount;

                for (const cat of txn.categories) {
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
            }

            // Replace old cache for this tenant, year and mode
            await prisma.realizedEntry.deleteMany({
                where: { tenantId: t.id, year: reqYear, viewMode }
            });

            // Insert new cache
            const createData = [];
            for (const [key, amount] of aggregates.entries()) {
                const [categoryId, costCenterId, monthStr] = key.split('|');
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
                await prisma.realizedEntry.createMany({ data: createData });
            }
        }
        report.push({ tenant: t.name, status: 'Success' });
    }

    return { success: true, year: reqYear, report };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const paramYear = searchParams.get('year');
        const reqYear = paramYear ? parseInt(paramYear, 10) : new Date().getFullYear();

        const result = await runCronSync(reqYear);
        return NextResponse.json(result);

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
