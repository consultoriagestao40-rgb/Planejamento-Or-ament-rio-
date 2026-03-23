import { prisma } from './prisma';

// Helper de Autenticação
export async function getValidAccessToken(tenantId?: string) {
    const tenant = tenantId
        ? await prisma.tenant.findUnique({ where: { id: tenantId } })
        : await prisma.tenant.findFirst();

    if (!tenant) throw new Error("No connected tenant found");

    if (tenant.accessToken === 'test-token') {
        throw new Error("⚠️ MODO DE TESTE: Use o botão Azul para conectar.");
    }

    if (tenant.tokenExpiresAt && new Date(tenant.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000) {
        if (!tenant.refreshToken) throw new Error("Refresh token missing");
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const res = await fetch('https://api.contaazul.com/oauth2/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tenant.refreshToken })
        });

        if (res.ok) {
            const newToken = await res.json();
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    accessToken: newToken.access_token,
                    refreshToken: newToken.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + newToken.expires_in * 1000)
                }
            });
            return { token: newToken.access_token, tenant };
        }
    }
    return { token: tenant.accessToken, tenant };
}

// Lógica de Sincronização V47.10.7 (Com Sales Fallback)
export async function fetchRealizedValues(accessToken: string, targetYear: number, costCenterId: string, viewMode: 'caixa' | 'competencia' = 'competencia', tenantId: string): Promise<Record<string, number>> {
    const values: Record<string, number> = {};
    const isCaixa = viewMode === 'caixa';
    const startStr = `${targetYear}-01-01`;
    const endStr = `${targetYear}-12-31`;
    
    const dateParam = isCaixa ? 'data_pagamento' : 'data_competencia';
    
    const urls = [
        // Eventos Financeiros (V2 e V1)
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        // Vendas (Fundamental para Receita se o Financeiro estiver vazio)
        `https://api-v2.contaazul.com/v1/vendas?data_emissao_de=${startStr}&data_emissao_ate=${endStr}&tamanho_pagina=100`,
        `https://api.contaazul.com/v1/vendas?data_emissao_de=${startStr}&data_emissao_ate=${endStr}&tamanho_pagina=100`
    ];

    for (const url of urls) {
        await aggregateTransactions(accessToken, url, values, url.includes('pagar') || url.includes('buy'), costCenterId, targetYear, viewMode, tenantId);
    }

    // Brute Force Fallback (Sem filtros de data)
    if (Object.keys(values).length === 0) {
        const bruteUrls = [
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/vendas?tamanho_pagina=100`
        ];
        for (const url of bruteUrls) {
            await aggregateTransactions(accessToken, url, values, false, costCenterId, targetYear, viewMode, tenantId);
        }
    }

    return values;
}

export async function syncRealizedEntries(tenantId: string, year: number, viewMode: 'caixa' | 'competencia' = 'competencia') {
    const { token } = await getValidAccessToken(tenantId);
    const realizedMap = await fetchRealizedValues(token, year, 'DEFAULT', viewMode, tenantId);

    const entriesToSave: any[] = [];
    for (const [key, amount] of Object.entries(realizedMap)) {
        const [idsPart, monthIdxStr] = key.split('-');
        const [catId, ccId] = idsPart.split('|');
        const monthIdx = parseInt(monthIdxStr, 10);
        if (isNaN(monthIdx)) continue;

        entriesToSave.push({
            tenantId,
            categoryId: catId,
            costCenterId: (ccId === 'NONE' || !ccId) ? null : ccId,
            month: monthIdx + 1,
            year,
            amount: Math.abs(amount),
            viewMode,
            externalId: `sync-${tenantId}-${catId}-${ccId || 'NONE'}-${year}-${monthIdx}-${viewMode}`,
            description: `Sincronização ${viewMode}`
        });
    }

    await prisma.realizedEntry.deleteMany({ 
        where: { 
            tenantId, 
            year, 
            viewMode,
            externalId: { startsWith: 'sync-' }
        } 
    });
    if (entriesToSave.length > 0) {
        await prisma.realizedEntry.createMany({ data: entriesToSave, skipDuplicates: true });
    }
    return { success: true, count: entriesToSave.length };
}

export async function syncMasterData(tenantId: string) {
    const { token } = await getValidAccessToken(tenantId);
    
    // 1. Sync Categories
    try {
        const catRes = await fetch(`https://api-v2.contaazul.com/v1/categorias?tamanho_pagina=100`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (catRes.ok) {
            const data = await catRes.json();
            const items = Array.isArray(data) ? data : (data.itens || []);
            
            // Mark all as inactive first
            await (prisma.category as any).updateMany({
                where: { tenantId },
                data: { isActive: false }
            });

            for (const item of items) {
                const catId = `${tenantId}:${item.id}`;
                await (prisma.category as any).upsert({
                    where: { id: catId },
                    update: { name: item.name, parentId: item.parent_id ? `${tenantId}:${item.parent_id}` : null, isActive: true },
                    create: { id: catId, name: item.name, tenantId, parentId: item.parent_id ? `${tenantId}:${item.parent_id}` : null, type: 'OTHER', isActive: true }
                });
            }
        }
    } catch (e) {
        console.error(`[SYNC-MASTER] Categorias error for ${tenantId}:`, e);
    }

    // 2. Sync Cost Centers
    try {
        const ccRes = await fetch(`https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (ccRes.ok) {
            const data = await ccRes.json();
            const items = Array.isArray(data) ? data : (data.itens || []);
            
            // Mark all as inactive first
            await (prisma.costCenter as any).updateMany({
                where: { tenantId },
                data: { isActive: false }
            });

            for (const item of items) {
                const ccId = `${tenantId}:${item.id}`;
                await (prisma.costCenter as any).upsert({
                    where: { id: ccId },
                    update: { name: item.name, isActive: true },
                    create: { id: ccId, name: item.name, tenantId, isActive: true }
                });
            }
        }
    } catch (e) {
        console.error(`[SYNC-MASTER] Cost Centers error for ${tenantId}:`, e);
    }

    return { success: true };
}

async function aggregateTransactions(accessToken: string, url: string, targetValues: Record<string, number>, isExpense: boolean, costCenterIdString: string, targetYear: number, viewMode: string, tenantId: string) {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 10) {
        try {
            const res = await fetch(`${url}&pagina=${page}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) { hasMore = false; break; }
            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.itens || data.items || data.eventos || data.vendas || []);
            if (items.length === 0) { hasMore = false; break; }

            for (const item of items) {
                // Mapeamento Flexível V1/V2/Vendas
                const amount = item.valor_total || item.total || item.valor || item.pago || item.valor_original || 0;
                const dateStr = item.data_competencia || item.data_emissao || item.venda_em || item.data_vencimento || item.vencimento || item.data_pagamento;
                
                if (!dateStr) continue;
                const dateObj = new Date(dateStr);
                if (dateObj.getFullYear() !== targetYear) continue;

                const monthIdx = dateObj.getMonth();
                const ccs = item.centros_de_custo || [];
                const categories = item.categorias || (item.categoria ? [item.categoria] : []);
                
                if (categories.length > 0) {
                    const finalCats = categories.filter((c: any) => !categories.some((other: any) => other.parent_id === c.id));
                    const catToUse = finalCats.length > 0 ? finalCats : [categories[0]];

                    for (const cat of catToUse) {
                        const catId = `${tenantId}:${cat.id || cat.categoria_id}`;
                        const catValue = Math.abs(typeof cat.valor === 'number' ? cat.valor : (amount / catToUse.length));

                        if (ccs.length === 0) {
                            const key = `${catId}|NONE-${monthIdx}`;
                            targetValues[key] = (targetValues[key] || 0) + catValue;
                        } else {
                            ccs.forEach((c: any) => {
                                const ccId = `${tenantId}:${c.id}`;
                                const percent = (c.percentual || (100 / ccs.length)) / 100;
                                const key = `${catId}|${ccId}-${monthIdx}`;
                                targetValues[key] = (targetValues[key] || 0) + (catValue * percent);
                            });
                        }
                    }
                }
            }
            if (items.length < 100) hasMore = false; else page++;
        } catch (e) { hasMore = false; break; }
    }
}

/**
 * Compatibility wrapper for Server Actions (syncFinancialData)
 * Calls runCronSync to perform the actual synchronization.
 */
import { runCronSync } from "./cronSync";
export async function syncData() {
    return await runCronSync(new Date().getFullYear());
}
