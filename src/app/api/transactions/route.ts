
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

        if (!categoryId) {
            return NextResponse.json({ success: false, error: 'Category ID is required' }, { status: 400 });
        }

        const accessToken = await getValidAccessToken();

        // Calculate Date Range for the requested month
        // V47.16.3: Widen the search window to the WHOLE YEAR.
        // Why? Conta Azul API only filters by "Due Date", but we need "Competency Date".
        // A transaction might have Competence in January but be Due in March.
        // If we only search Due Date in Jan, we miss it.
        const startStr = `${year}-01-01`;
        const endStr = `${year}-12-31`;

        // Fetch Receivables
        const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
        const receivables = await fetchTransactions(accessToken, receivablesUrl, costCenterId, categoryId, year, month);

        // Fetch Payables
        const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
        const payables = await fetchTransactions(accessToken, payablesUrl, costCenterId, categoryId, year, month);

        const allTransactions = [...receivables, ...payables].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return NextResponse.json({
            success: true,
            transactions: allTransactions
        });

    } catch (error: any) {
        console.error('Transaction fetch failure:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function fetchTransactions(accessToken: string, baseUrl: string, costCenterId: string, categoryId: string, targetYear: number, targetMonth: number) {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];

    let finalUrlBase = baseUrl;
    // Filter by Cost Center if provided
    if (costCenterId && costCenterId !== 'DEFAULT' && costCenterId !== 'Geral') {
        finalUrlBase += `&centro_custo_id=${costCenterId}`;
    }

    // Increased page limit to 50 (5000 items) to cover the whole year search
    while (hasMore && page <= 50) { // Limit pages for responsiveness
        const url = `${finalUrlBase}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;

            const data = await res.json();
            const items = data.itens || [];

            if (items.length === 0) break;

            items.forEach((item: any) => {
                // Check if canceled
                if ((item.status || '').toUpperCase().includes('CANCEL')) return;

                // Check Category Match
                const cats = item.categorias || [];
                const hasCategory = cats.some((c: any) => c.id === categoryId);

                if (hasCategory) {
                    // DEBUG: Inspect Raw Values for MRV
                    if (item.cliente && item.cliente.nome && item.cliente.nome.includes('MRV')) {
                        console.log(`[DEBUG_MRV] Name: ${item.cliente.nome} | Total: ${item.total} | Valor: ${item.valor} | Net: ${item.valor_liquido} | D.Comp: ${item.data_competencia} | D.Venc: ${item.data_vencimento}`);
                    }

                    // Check Competence/Date Match (Strictly same logic as Sync)
                    const dateStr = item.data_competencia || item.data_vencimento || item.vencimento || item.data_pagamento;
                    const dateObj = dateStr ? new Date(dateStr) : new Date();

                    if (dateObj.getMonth() === targetMonth && dateObj.getFullYear() === targetYear) {
                        transactions.push({
                            id: item.id,
                            date: dateStr,
                            description: item.descricao || 'Sem descrição',
                            // V47.14: Use Gross Value for consistency with DRE
                            value: item.valor || item.valor_original || item.total || item.valor_liquido || 0,
                            customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                            status: item.status,
                            debug_info: `V:${item.valor} | VO:${item.valor_original} | T:${item.total} | VL:${item.valor_liquido}`
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
