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
        const allTenants = tenantId === 'ALL'
            ? await prisma.tenant.findMany({ orderBy: { tokenExpiresAt: 'desc' } })
            : await prisma.tenant.findMany({ where: { id: tenantId }, orderBy: { tokenExpiresAt: 'desc' } });

        // DEDUPLICATE: If multiple DB entries exist for the same name/CNPJ (even with spaces or case differences), we only fetch once.
        // This prevents the [JVS] [JVS] duplication seen in the UI.
        const seenKeys = new Set();
        const tenants = allTenants.filter(t => {
            const superCleanName = (t.name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const key = cleanCnpj || superCleanName; // prefer CNPJ, fallback to clean name
            
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });

        if (tenants.length === 0) {
            return NextResponse.json({ success: false, error: 'No connected companies found' }, { status: 400 });
        }

        // Widen the search window by 1 month before and after to catch most Competência vs Caixa edge cases,
        // without destroying performance by fetching the entire year.
        const prevDate = new Date(year, month - 1, 1);
        const startStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

        const nextDate = new Date(year, month + 2, 0); // Last day of next month
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
        const allTransactions = results.flat();

        // FINAL SAFETY: Deduplicate by transaction ID.
        // This stops duplication if the same account is connected twice or if pagination overlaps.
        const uniqueTxnsMap = new Map();
        for (const txn of allTransactions) {
            // Use a combination of ID and value/date as a key to be absolutely sure
            const key = `${txn.id}-${txn.value}-${txn.date}`;
            if (!uniqueTxnsMap.has(key)) {
                uniqueTxnsMap.set(key, txn);
            }
        }

        const sortedTxns = Array.from(uniqueTxnsMap.values()).sort((a: any, b: any) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        return NextResponse.json({
            success: true,
            transactions: sortedTxns
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

            for (const item of items) {
                if ((item.status || '').toUpperCase().includes('CANCEL')) continue;

                const cats = item.categorias || [];
                if (cats.length === 0) continue;

                // Align exactly with cronSync.ts: we assign 100% of the value solely to the FIRST category linked.
                const primaryCat = cats[0];
                if (!targetCategoryIds.includes(primaryCat.id)) continue;

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
                                            const itemValue = item.total || item.valor || 0;
                                            const proportionalValue = itemValue * percent;
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

                const ccsCount = ccs.length || 1;

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
                if (dateObj.getMonth() !== targetMonth || dateObj.getFullYear() !== targetYear) continue;

                const absAmount = Math.abs(amount);

                // 2-PASS RATEIO FOR REMAINDERS:
                // First pass: sum explicit allocations to find the remaining balance
                let totalAllocated = 0;
                let unallocatedCount = 0;

                const processedCcs = ccs.map((cc: any) => {
                    let explicitAmount = null;
                    if (typeof cc.valor === 'number') {
                        explicitAmount = Math.abs(cc.valor);
                    } else if (typeof cc.percentual === 'number') {
                        explicitAmount = absAmount * (cc.percentual / 100);
                    }

                    if (explicitAmount !== null) {
                        totalAllocated += explicitAmount;
                    } else {
                        unallocatedCount++;
                    }

                    return { ...cc, explicitAmount };
                });

                const remainingAmount = Math.max(0, absAmount - totalAllocated);
                const fallbackPerCc = unallocatedCount > 0 ? (remainingAmount / unallocatedCount) : 0;

                if (ccs.length === 0) {
                    if (isFiltered) continue; // Ignore if user explicitly restricted by CC

                    transactions.push({
                        id: item.id,
                        date: dateStr,
                        description: [item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição',
                        value: absAmount,
                        customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                        status: item.status,
                        costCenters: [{ id: 'NONE', nome: 'Geral' }]
                    });
                } else {
                    for (const cc of processedCcs) {
                        if (isFiltered && !targetCcs.includes(cc.id)) continue;

                        const specificAmount = cc.explicitAmount !== null ? cc.explicitAmount : fallbackPerCc;

                        transactions.push({
                            id: `${item.id}-${cc.id}`,
                            date: dateStr,
                            description: ccsCount > 1
                                ? `${[item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição'} (Rateio ${cc.nome})`
                                : ([item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição'),
                            value: specificAmount,
                            customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                            status: item.status,
                            costCenters: [{ id: cc.id, nome: cc.nome }]
                        });
                    }
                }
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) {
            hasMore = false;
        }
    }

    return transactions;
}
