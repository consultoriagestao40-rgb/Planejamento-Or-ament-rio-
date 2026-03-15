import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';
import { ensureTenantSchema } from '@/lib/db-utils';
import { prisma } from '@/lib/prisma';

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

        const allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });

        // DETERMINE PEER GROUP (Same logic as api/sync and cronSync)
        const companyGroups = new Map<string, string[]>();
        allTenants.forEach((t: any) => {
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
            if (!companyGroups.has(key)) companyGroups.set(key, []);
            companyGroups.get(key)!.push(t.id);
        });

        let targetTenants = [];
        if (tenantId === 'ALL') {
             // Only fetch from Primary IDs
             const primaryIds = Array.from(companyGroups.values()).map(ids => ids.sort()[0]);
             targetTenants = allTenants.filter(t => primaryIds.includes(t.id));
        } else {
            const requested = allTenants.find(t => t.id === tenantId);
            if (requested) {
                const cleanCnpj = (requested.cnpj || '').replace(/\D/g, '');
                const cleanName = (requested.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
                const group = companyGroups.get(key) || [tenantId];
                const primaryId = group.sort()[0];
                targetTenants = allTenants.filter(t => t.id === primaryId);
            }
        }

        if (targetTenants.length === 0) {
            return NextResponse.json({ success: false, error: 'No reachable companies found' }, { status: 400 });
        }

        // Search window buffer (aligned with sync)
        const prevDate = new Date(year, month - 3, 1);
        const startStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;
        const nextDate = new Date(year, month + 3, 0);
        const endStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

        const initialCategoryIds = categoryId.split(',');
        const allCategoryIds = new Set<string>();
        const queue = [...initialCategoryIds];
        
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (allCategoryIds.has(currentId)) continue;
            allCategoryIds.add(currentId);
            const children = await prisma.category.findMany({
                where: { parentId: currentId },
                select: { id: true }
            });
            queue.push(...children.map(c => c.id));
        }

        const expandedCategoryIds = Array.from(allCategoryIds);

        const tenantPromises = targetTenants.map(async (t) => {
            try {
                const { token } = await getValidAccessToken(t.id);
                const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
                const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;

                const [receivables, payables] = await Promise.all([
                    fetchTransactions(token, receivablesUrl, costCenterId, expandedCategoryIds.join(','), year, month - 1, viewMode),
                    fetchTransactions(token, payablesUrl, costCenterId, expandedCategoryIds.join(','), year, month - 1, viewMode)
                ]);

                return [...receivables, ...payables].map(txn => ({
                    ...txn,
                    description: targetTenants.length > 1 ? `[${t.name}] ${txn.description}` : txn.description,
                    tenantName: t.name,
                    tenantId: t.id
                }));
            } catch (err: any) {
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
            version: "0.3.10-FINAL",
            transactions: allTransactions
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function fetchTransactions(accessToken: string, baseUrl: string, costCenterIdStr: string, categoryId: string, targetYear: number, targetMonth: number, viewMode: 'caixa' | 'competencia' = 'competencia') {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];
    const targetCategoryIds = categoryId.split(',');

    while (hasMore && page <= 20) {
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

                // Rateio categories
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
                                cats.forEach((c: any) => { if (catRateioMap.has(c.id)) c.valor = catRateioMap.get(c.id); });
                            }
                        }
                    } catch(e) {}
                }

                const cleanTargetCategoryIds = targetCategoryIds.map(id => id.includes(':') ? id.split(':')[1] : id);
                const leaves = cats.filter((c: any) => !cats.some((other: any) => other.parent_id === c.id));
                const matchingLeaves = leaves.filter((c: any) => cleanTargetCategoryIds.includes(String(c.id)));
                if (matchingLeaves.length === 0) continue;

                let targetAmount = 0;
                matchingLeaves.forEach((c: any) => {
                    const val = (typeof c.valor === 'number') ? Math.abs(c.valor) : (Math.abs(item.pago || item.total || 0) / leaves.length);
                    targetAmount += val;
                });

                let dateStr: string;
                let amount: number;

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento;
                    amount = item.pago || item.valor_pago || targetAmount || 0;
                } else {
                    dateStr = item.data_competencia || item.data_vencimento;
                    amount = targetAmount;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                // Match month carefully (JS Date month is 0-indexed)
                if (dateObj.getMonth() !== targetMonth || dateObj.getFullYear() !== targetYear) continue;

                transactions.push({
                    id: item.id,
                    date: dateStr,
                    description: [item.descricao, item.observacao].filter(Boolean).join(' - ') || 'Sem descrição',
                    value: Math.abs(amount),
                    customer: item.cliente ? item.cliente.nome : (item.fornecedor ? item.fornecedor.nome : 'N/A'),
                    status: item.status
                });
            }
            if (items.length < 100) hasMore = false; else page++;
        } catch (e) { hasMore = false; }
    }
    return transactions;
}
