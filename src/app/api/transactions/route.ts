import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await ensureTenantSchema();
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';
        const categoryId = searchParams.get('categoryId');
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '2026', 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantId = searchParams.get('tenantId') || 'ALL';

        if (!categoryId) {
            return NextResponse.json({ success: false, error: 'Category ID is required' }, { status: 400 });
        }

        // Determine which tenants to query
        const { prisma } = await import('@/lib/prisma');
        const tenants = tenantId === 'ALL'
            ? await prisma.tenant.findMany()
            : await prisma.tenant.findMany({ where: { id: tenantId } });

        if (tenants.length === 0) {
            return NextResponse.json({ success: false, error: 'No connected companies found' }, { status: 400 });
        }

        // Widen the search window significantly to catch Competência vs Caixa edge cases,
        // (e.g. competency in Jan, but due date in Oct or April).
        const prevDate = new Date(year, month - 3, 1);
        const startStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

        const nextDate = new Date(year, month + 4, 0); // Last day of 3 months ahead
        const endStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

        // Fetch concurrently to prevent Vercel 15s Timeout
        const tenantPromises = tenants.map(async (t) => {
            try {
                const { token } = await getValidAccessToken(t.id);

                const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&categoria_id=${categoryId}&tamanho_pagina=100`;
                const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&categoria_id=${categoryId}&tamanho_pagina=100`;

                const [receivables, payables] = await Promise.all([
                    fetchTransactions(token, receivablesUrl, costCenterId, categoryId, year, month, viewMode),
                    fetchTransactions(token, payablesUrl, costCenterId, categoryId, year, month, viewMode)
                ]);

                return [...receivables, ...payables].map(txn => ({
                    ...txn,
                    description: tenants.length > 1 ? `[${t.name}] ${txn.description}` : txn.description,
                    tenantName: t.name,
                    tenantId: t.id
                }));
            } catch (err: any) {
                console.error(`Failed to fetch transactions for tenant ${t.id}:`, err);
                return [];
            }
        });

        const results = await Promise.all(tenantPromises);
        const allTransactions = results.flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return NextResponse.json({
            success: true,
            transactions: allTransactions
        });

    } catch (error: any) {
        console.error('Transaction fetch failure:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function fetchTransactions(accessToken: string, baseUrl: string, costCenterIdStr: string, categoryId: string, targetYear: number, targetMonth: number, viewMode: 'caixa' | 'competencia' = 'competencia') {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];

    const targetCcs = costCenterIdStr.split(',').map(id => id.trim()).filter(id => id !== 'DEFAULT' && id !== 'Geral' && id !== '');
    const isFiltered = targetCcs.length > 0;
    const targetCategoryIds = categoryId.split(',');

    while (hasMore && page <= 50) {
        let url = `${baseUrl}&pagina=${page}`;

        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;

            const data = await res.json();
            const items = data.itens || [];

            if (items.length === 0) break;

            items.forEach((item: any) => {
                if ((item.status || '').toUpperCase().includes('CANCEL')) return;

                const cats = item.categorias || [];
                if (cats.length === 0) return;

                // Align exactly with cronSync.ts: we assign 100% of the value solely to the FIRST category linked.
                const primaryCat = cats[0];
                if (!targetCategoryIds.includes(primaryCat.id)) return;

                const ccs = item.centros_de_custo || [];
                // CRITICAL ALIGNMENT: If an event has multiple installments, we need to handle it 
                // like cronSync does to avoid missing chunks of the value in the Modal.
                const ccsCount = ccs.length || 1;

                let dateStr: string;
                let amount: number;

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    // AGREE WITH CRONSYNC: Prioritize installment/payment value
                    amount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                } else {
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                    // AGREE WITH CRONSYNC: Prioritize installment value (valor) over SALE TOTAL (total)
                    amount = item.valor || item.amount || item.total || 0;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                if (dateObj.getMonth() !== targetMonth || dateObj.getFullYear() !== targetYear) return;

                // Enforce positive absolute amounts to match BudgetGrid's subtraction matrix
                const absAmount = Math.abs(amount);
                const amountPerCc = absAmount / ccsCount;

                if (ccs.length === 0) {
                    if (isFiltered) return; // Ignore if user explicitly restricted by CC

                    transactions.push({
                        id: item.id,
                        date: dateStr,
                        description: [item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição',
                        value: amountPerCc,
                        customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                        status: item.status,
                        costCenters: [{ id: 'NONE', nome: 'Geral' }]
                    });
                } else {
                    for (const cc of ccs) {
                        if (isFiltered && !targetCcs.includes(cc.id)) continue;

                        transactions.push({
                            id: `${item.id}-${cc.id}`,
                            date: dateStr,
                            description: ccsCount > 1
                                ? `${[item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição'} (Rateio ${cc.nome})`
                                : ([item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição'),
                            value: amountPerCc,
                            customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                            status: item.status,
                            costCenters: [{ id: cc.id, nome: cc.nome }]
                        });
                    }
                }
            });

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) {
            hasMore = false;
        }
    }

    return transactions;
}
