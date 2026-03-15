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
        // Aligned with cronSync viewMode logic.
        const prevDate = new Date(year, month - 6, 1);
        const startStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

        const nextDate = new Date(year, month + 7, 0); // Last day of 6 months ahead
        const endStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

        // Fetch concurrently to prevent Vercel 15s Timeout
        // Clean categoryId to remove tenant prefixes before calling CA API
        const initialCategoryIds = categoryId.split(',');
        
        // RECURSIVE CATEGORY EXPANSION: Align with Grid logic (DRE sums up children)
        const allCategoryIds = new Set<string>();
        const queue = [...initialCategoryIds];
        
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (allCategoryIds.has(currentId)) continue;
            allCategoryIds.add(currentId);
            
            // Find children in DB to include their transactions in this parent modal
            const children = await prisma.category.findMany({
                where: { parentId: currentId },
                select: { id: true }
            });
            queue.push(...children.map(c => c.id));
        }

        const expandedCategoryIds = Array.from(allCategoryIds);
        const cleanCategoryId = expandedCategoryIds.map(id => id.includes(':') ? id.split(':')[1] : id).join(',');

        const tenantPromises = tenants.map(async (t) => {
            try {
                const { token } = await getValidAccessToken(t.id);

                // REMOVE category filter from URL to match cronSync behavior and catch multi-category items
                // Use expanded clean IDs for filtering inside fetchTransactions
                const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
                const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;

                const [receivables, payables] = await Promise.all([
                    fetchTransactions(token, receivablesUrl, costCenterId, expandedCategoryIds.join(','), year, month, viewMode),
                    fetchTransactions(token, payablesUrl, costCenterId, expandedCategoryIds.join(','), year, month, viewMode)
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
        const consolidatedMap = new Map<string, any>();
        const allTransactionsRaw = results.flat();

        for (const txn of allTransactionsRaw) {
            const existing = consolidatedMap.get(txn.id);
            if (existing) {
                existing.value += txn.value;
            } else {
                consolidatedMap.set(txn.id, txn);
            }
        }

        const allTransactions = Array.from(consolidatedMap.values()).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return NextResponse.json({
            success: true,
            version: "0.2.5-FINAL",
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

            for (const item of items) {
                if ((item.status || '').toUpperCase().includes('CANCEL')) continue;

                const cats = item.categorias || [];
                if (cats.length === 0) continue;

                // Strip any tenant prefix from the target categories list for clean comparison
                const cleanTargetCategoryIds = targetCategoryIds.map(id => id.includes(':') ? id.split(':')[1] : id);

                // MATCH cronSync.ts EXACTLY (v0.1.9):
                // Se houver mais de uma categoria, precisamos buscar os detalhes para pegar o valor bruto correto
                if (cats.length > 1) {
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                const catRateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.id_categoria) catRateioMap.set(r.id_categoria, (catRateioMap.get(r.id_categoria) || 0) + (r.valor || 0));
                                });
                                cats.forEach((c: any) => {
                                    if (catRateioMap.has(c.id)) c.valor = catRateioMap.get(c.id);
                                });
                            }
                        }
                    } catch(e) {}
                }

                const leaves = cats.filter((c: any) => {
                    const cid = c.id;
                    const hasChild = cats.some((other: any) => (other.parent_id === cid) || (other.parentId === cid) || (other.category_parent_id === cid));
                    return !hasChild;
                });
                
                const matchingLeaves = leaves.filter((c: any) => cleanTargetCategoryIds.includes(c.id));
                if (matchingLeaves.length === 0) continue;

                let targetAmount = 0;
                matchingLeaves.forEach((c: any) => {
                    // Se o rateio acima funcionou, c.valor terá o valor BRUTO da categoria
                    const val = (typeof c.valor === 'number') ? Math.abs(c.valor) : (Math.abs(item.pago || item.valor_pago || item.total || 0) / leaves.length);
                    targetAmount += val;
                });

                const ccsOrig = item.centros_de_custo || [];
                let ccs = [...ccsOrig];

                // CRITICAL ALIGNMENT: If an event has multiple cost centers or installments, 
                // we need to fetch details to get the exact split per installment.
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
                                            const percent = (rc.valor || 0) / r.valor;
                                            const proportionalValue = (item.total || item.valor || 0) * percent;
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + proportionalValue);
                                        });
                                    }
                                });
                                const uniqueCcsMap = new Map();
                                ccs.forEach((cc: any) => {
                                    const val = rateioMap.has(cc.id) ? rateioMap.get(cc.id) : cc.valor;
                                    uniqueCcsMap.set(cc.id, (uniqueCcsMap.get(cc.id) || 0) + val);
                                });
                                ccs = Array.from(uniqueCcsMap.entries()).map(([id, valor]) => ({ 
                                    id: id as string, 
                                    nome: (ccsOrig.find((c: any) => c.id === id)?.nome || 'Geral') as string, 
                                    valor: valor as number 
                                }));
                            }
                        }
                    } catch (e) { }
                }

                const ccsCount = ccs.length || 1;

                let dateStr: string;
                let amount: number;

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    amount = item.pago || item.valor_pago || targetAmount || 0;
                } else {
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                    // Use targetAmount which now includes the absolute rateio from pData
                    amount = targetAmount;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                if (dateObj.getMonth() !== targetMonth || dateObj.getFullYear() !== targetYear) continue;

                // Enforce positive absolute amounts to match BudgetGrid's subtraction matrix
                const absAmount = Math.abs(amount);
                const amountPerCc = absAmount / ccsCount;

                if (ccs.length === 0) {
                    if (isFiltered) continue; // Ignore if user explicitly restricted by CC

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
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) {
            hasMore = false;
        }
    }

    return transactions;
}
