import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
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

        // Widen the search window by 1 month before and after to catch most Competência vs Caixa edge cases,
        // without destroying performance by fetching the entire year.
        const prevDate = new Date(year, month - 1, 1);
        const startStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

        const nextDate = new Date(year, month + 2, 0); // Last day of next month
        const endStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

        let allTransactions: any[] = [];

        for (const t of tenants) {
            try {
                const { token } = await getValidAccessToken(t.id);

                // Fetch Receivables
                const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
                const receivables = await fetchTransactions(token, receivablesUrl, costCenterId, categoryId, year, month, viewMode);

                // Fetch Payables
                const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
                const payables = await fetchTransactions(token, payablesUrl, costCenterId, categoryId, year, month, viewMode);

                // Add company name to description for clarity when aggregated
                const tenantTxns = [...receivables, ...payables].map(txn => ({
                    ...txn,
                    description: tenants.length > 1 ? `[${t.name}] ${txn.description}` : txn.description,
                    tenantName: t.name,
                    tenantId: t.id
                }));

                allTransactions = [...allTransactions, ...tenantTxns];
            } catch (err: any) {
                console.error(`Failed to fetch transactions for tenant ${t.id}:`, err);
            }
        }

        allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
    const isMultiSelect = targetCcs.length > 1;

    let finalUrlBase = baseUrl;
    // Filter by Cost Center if provided and only ONE is selected
    if (isFiltered && !isMultiSelect) {
        finalUrlBase += `&centro_custo_id=${targetCcs[0]}`;
    }

    // TWO-PASS approach for single CC
    const singleCCItems: any[] = [];
    const multiCCItems: any[] = [];

    while (hasMore && page <= 50) {
        const url = `${finalUrlBase}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;

            const data = await res.json();
            const items = data.itens || [];

            if (items.length === 0) break;

            items.forEach((item: any) => {
                if ((item.status || '').toUpperCase().includes('CANCEL')) return;

                const ccs = item.centros_de_custo || [];
                if (isFiltered) {
                    const matchesTarget = ccs.some((c: any) => targetCcs.includes(c.id));
                    if (!matchesTarget) return;
                }

                const cats = item.categorias || [];
                const targetCategoryIds = categoryId.split(',');
                const hasCategory = cats.some((c: any) => targetCategoryIds.includes(c.id));
                if (!hasCategory) return;

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
                if (dateObj.getMonth() !== targetMonth || dateObj.getFullYear() !== targetYear) return;

                let finalAmount = amount;
                let descriptionSuffix = '';

                // If multi-select, calculate proportional value
                if (isMultiSelect) {
                    const matchingCcs = ccs.filter((c: any) => targetCcs.includes(c.id)).length;
                    const ccsCount = ccs.length || 1;
                    if (matchingCcs < ccsCount) { // Partial coverage of umbrella
                        finalAmount = amount * (matchingCcs / ccsCount);
                        descriptionSuffix = ` (Proporcional: ${matchingCcs}/${ccsCount} CCs)`;
                    }
                }

                const txn = {
                    id: item.id,
                    date: dateStr,
                    description: (item.descricao || 'Sem descrição') + descriptionSuffix,
                    value: finalAmount,
                    customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                    status: item.status,
                    ccCount: ccs.length,
                    costCenters: ccs.length > 0 ? ccs.map((c: any) => ({ id: c.id, nome: c.nome })) : [{ id: 'NONE', nome: 'Geral' }],
                    debug_info: `V:${item.valor} | VO:${item.valor_original} | T:${item.total} | VL:${item.valor_liquido}`
                };

                if (isMultiSelect) {
                    // Straight forward accumulation for multi-select
                    transactions.push(txn);
                } else {
                    if (isFiltered && ccs.length > 1) {
                        multiCCItems.push(txn);
                    } else {
                        singleCCItems.push(txn);
                    }
                }
            });

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) {
            hasMore = false;
        }
    }

    if (isMultiSelect) {
        return transactions;
    }

    // Single select or global: prefer single-CC individual entries
    if (singleCCItems.length > 0) {
        return singleCCItems;
    } else if (multiCCItems.length > 0) {
        return multiCCItems.map(t => ({
            ...t,
            value: t.value / (t.ccCount || 1),
            description: `${t.description} (÷${t.ccCount} CCs)`
        }));
    }

    return transactions;
}
