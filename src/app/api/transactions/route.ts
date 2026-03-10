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

                const cats = (item.categorias || []) as any[];
                const matchingCats = cats.filter(c => targetCategoryIds.includes(c.id));
                if (matchingCats.length === 0) continue;

                let ccs = item.centros_de_custo || [];

                if (ccs.length > 1 || cats.length > 1) { // Deep extraction also needed for multi-category splits
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                // Augment Categories with explicit values and exclusively scoped CCs from the API!
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.id_categoria) {
                                        const targetCat = cats.find((c: any) => c.id === r.id_categoria);
                                        if (targetCat) {
                                            // Normalize values to absolute for display
                                            if (typeof r.valor === 'number') targetCat.valor = Math.abs(r.valor);
                                            
                                            if (r.rateio_centro_custo && r.rateio_centro_custo.length > 0) {
                                                // NORMALIZE V2 CCs TO V1 FORMAT (id_centro_custo -> id)
                                                targetCat.centros_de_custo_exclusivos = r.rateio_centro_custo.map((rc: any) => ({
                                                    id: rc.id_centro_custo, // Map V2 field to V1 name
                                                    valor: Math.abs(rc.valor || 0),
                                                    percentual: rc.percentual
                                                }));
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    } catch(e) {}
                }

                // NOW calculate baseAmountForSelection using potentially augmented cats
                let baseAmountForSelection = 0;
                let catRatio = 0;
                const eventTotal = Math.abs(item.total || item.valor || 0) || 1;
                const hasExplicitValues = cats.length > 0 && cats.every((c: any) => typeof c.valor === 'number');
                
                if (hasExplicitValues) {
                    baseAmountForSelection = matchingCats.reduce((sum, c) => sum + Math.abs(c.valor || 0), 0);
                    const totalCatsSum = cats.reduce((sum, c) => sum + Math.abs(c.valor || 0), 0) || eventTotal;
                    catRatio = baseAmountForSelection / totalCatsSum;
                } else {
                    catRatio = matchingCats.length / cats.length;
                    baseAmountForSelection = eventTotal * catRatio;
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

                // Use category-specific CCs if deep extraction found them. Otherwise fallback to event CCs.
                let ccsToProcess = ccs;
                const exclusiveCcs = matchingCats.flatMap((c: any) => c.centros_de_custo_exclusivos || []);
                if (exclusiveCcs.length > 0) {
                    ccsToProcess = exclusiveCcs;
                }

                if (ccsToProcess.length === 0) {
                    if (isFiltered) continue; // Ignore if user explicitly restricted by CC

                    transactions.push({
                        id: item.id,
                        date: dateStr,
                        description: [item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição',
                        value: baseAmountForSelection,
                        customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                        status: item.status,
                        costCenters: [{ id: 'NONE', nome: 'Geral' }]
                    });
                } else {
                    // Calculate CC values relative to the base amount of our selected categories
                    let totalAllocated = 0;
                    let unallocatedCount = 0;

                    const processedCcs = ccsToProcess.map((cc: any) => {
                        let amountPerCc = null;
                        if (typeof cc.valor === 'number') {
                            amountPerCc = Math.abs(cc.valor); // Exact CC value sent by CA for THIS category
                        } else if (typeof cc.percentual === 'number') {
                            amountPerCc = baseAmountForSelection * (cc.percentual / 100);
                        }

                        if (amountPerCc !== null) {
                            totalAllocated += amountPerCc;
                        } else {
                            unallocatedCount++;
                        }
                        return { ...cc, amountPerCc };
                    });

                    const remainingAmount = Math.max(0, baseAmountForSelection - totalAllocated);
                    const fallbackPerCc = unallocatedCount > 0 ? (remainingAmount / unallocatedCount) : 0;

                    for (const cc of processedCcs) {
                        if (isFiltered && !targetCcs.includes(cc.id)) continue;

                        const specificAmount = cc.amountPerCc !== null ? cc.amountPerCc : fallbackPerCc;

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
