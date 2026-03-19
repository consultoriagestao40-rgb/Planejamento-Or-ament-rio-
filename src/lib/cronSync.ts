import { prisma } from './prisma';

import { refreshAccessToken } from './contaAzul';

async function getValidAccessToken(tenantId: string) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t || !t.refreshToken) throw new Error("No refresh token for tenant " + tenantId);
    
    try {
        const tokens = await refreshAccessToken(t.refreshToken);
        await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000)
            }
        });
        return tokens.access_token;
    } catch (e: any) {
        throw new Error(`Failed to refresh token for ${tenantId}: ${e.message}`);
    }
}

async function fetchAllTransactionsForYear(accessToken: string, url: string, targetYear: number, viewMode: string, isExpense: boolean, pushLog?: (msg: string) => void): Promise<any[]> {
    let page = 1;
    let hasMore = true;
    const allItems: any[] = [];

    while (hasMore) {
        try {
            const separator = url.includes('?') ? '&' : '?';
            const fullUrl = `${url}${separator}pagina=${page}&tamanho_pagina=100`;
            const res = await fetch(fullUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;
            const data = await res.json();
            const itemList = Array.isArray(data) ? data : (data.vendas || data.itens || data.eventos || []);

            if (itemList.length === 0) {
                hasMore = false;
                break;
            }

            for (const item of itemList) {
                if ((item.status || '').includes('CANCEL')) continue;
                
                // DATE PARSING - CA V1 formats: "DD/MM/YYYY" or "YYYY-MM-DD"
                const dateStr = item.data || item.data_competencia || item.data_vencimento || item.data_liquidacao || item.data_venda;
                if (!dateStr) continue;

                let itemYear = 0;
                let itemMonth = 0;

                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    itemYear = parseInt(parts[2]);
                    itemMonth = parseInt(parts[1]);
                } else if (dateStr.includes('-')) {
                    const parts = dateStr.split('-');
                    itemYear = parseInt(parts[0]);
                    itemMonth = parseInt(parts[1]);
                }

                if (itemYear !== targetYear) continue;

                allItems.push({
                    id: item.id || `TX-${Math.random()}`,
                    description: item.description || item.memo || item.nome_cliente || item.cliente?.nome || 'CONTA AZUL SYNC',
                    amount: item.valor || item.valor_total || item.valor_liquido || 0,
                    month: itemMonth,
                    categories: item.categorias || (item.categoria ? [item.categoria] : []),
                    costCenters: item.centros_custo || (item.centro_custo ? [item.centro_custo] : [])
                });
            }

            if (itemList.length < 10) hasMore = false;
            else page++;
            if (page > 100) hasMore = false;
        } catch (e) { hasMore = false; }
    }
    return allItems;
}

export async function runCronSync(reqYear: number, tenantId?: string, pushLog?: (msg: string) => void) {
    const tenants = await prisma.tenant.findMany();
    const allCategories = await prisma.category.findMany();
    const allCostCenters = await prisma.costCenter.findMany();

    const catMap = new Map<string, string>();
    allCategories.forEach(c => {
        const rawId = c.id.includes(':') ? c.id.split(':')[1] : c.id;
        catMap.set(rawId, c.id);
    });

    const ccMap = new Map<string, string>();
    allCostCenters.forEach(c => {
        const rawId = c.id.includes(':') ? c.id.split(':')[1] : c.id;
        ccMap.set(rawId, c.id);
    });

    const report = [];
    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;

    for (const t of targets) {
        try {
            const token = await getValidAccessToken(t.id);
            if (pushLog) pushLog(`[SYNC] [${t.name}] Iniciando integração...`);

            for (const viewMode of ['competencia', 'caixa'] as const) {
                const startStr = `${reqYear - 1}-01-01`;
                const endStr = `${reqYear + 1}-12-31`;

                const endpoints = viewMode === 'caixa' ? [
                    { name: 'Recebimentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar', isExpense: false },
                    { name: 'Pagamentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar', isExpense: true }
                ] : [
                    { name: 'Recebimentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar', isExpense: false },
                    { name: 'Vendas', url: 'https://api-v2.contaazul.com/v1/vendas/buscar', isExpense: false },
                    { name: 'Pagamentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar', isExpense: true }
                ];

                const entriesMap = new Map<string, any>();
                let firstItemInfo = '';

                for (const ep of endpoints) {
                    let dateParams = '';
                    if (ep.name === 'Vendas') {
                        dateParams = `data_inicio=${startStr}&data_fim=${endStr}`;
                    } else {
                        // Financeiro V1 standard uses data_emissao as proxy for competence or data_vencimento
                        // But for Jan 156k SPOT specifically, it's likely a Sale
                        dateParams = viewMode === 'caixa' 
                            ? `data_liquidacao_inicio=${startStr}&data_liquidacao_fim=${endStr}` 
                            : `data_vencimento_inicio=${startStr}&data_vencimento_fim=${endStr}`;
                    }

                    const items = await fetchAllTransactionsForYear(token, ep.url + '?' + dateParams, reqYear, viewMode, ep.isExpense, pushLog);
                    
                    if (items.length > 0 && !firstItemInfo) {
                        const it = items[0];
                        firstItemInfo = `[${ep.name}] ID:${it.id} M:${it.month}`;
                    }

                    for (const tx of items) {
                        if (tx.month === 0) continue;

                        let mainCatId = tx.categories?.[0]?.id;
                        let mainCatName = tx.categories?.[0]?.name;
                        const mainCcId = tx.costCenters?.[0]?.id;

                        if (!mainCatId) mainCatId = 'SYSTEM_GENERIC_REVENUE';

                        if (!catMap.has(mainCatId)) {
                            const newCatName = mainCatName || 'Importado CA';
                            const newCatId = `${t.id}:${mainCatId}`;
                            const catType = ep.isExpense ? 'EXPENSE' : 'REVENUE';
                            
                            try {
                                await prisma.category.upsert({
                                    where: { id: newCatId },
                                    create: { id: newCatId, name: newCatName, tenantId: t.id, type: catType },
                                    update: { name: newCatName }
                                });
                                catMap.set(mainCatId, newCatId);
                            } catch (e) { continue; }
                        }

                        const ek = `${tx.id}:${viewMode}`;
                        if (entriesMap.has(ek)) {
                            entriesMap.get(ek).amount += tx.amount;
                        } else {
                            entriesMap.set(ek, {
                                tenantId: t.id,
                                categoryId: catMap.get(mainCatId)!,
                                costCenterId: (mainCcId && ccMap.has(mainCcId)) ? ccMap.get(mainCcId)! : null,
                                year: reqYear,
                                month: tx.month,
                                amount: tx.amount,
                                viewMode: viewMode,
                                externalId: tx.id,
                                description: tx.description
                            });
                        }
                    }
                }

                const entriesToSave = Array.from(entriesMap.values());
                await prisma.realizedEntry.deleteMany({
                    where: { tenantId: t.id, year: reqYear, viewMode: viewMode }
                });

                if (entriesToSave.length > 0) {
                    await prisma.realizedEntry.createMany({ data: entriesToSave });
                }
                report.push({ tenant: t.name, mode: viewMode, count: entriesToSave.length, sample: firstItemInfo });
            }
        } catch (err: any) {
            report.push({ tenant: t.name, error: err.message });
        }
    }
    return report;
}
