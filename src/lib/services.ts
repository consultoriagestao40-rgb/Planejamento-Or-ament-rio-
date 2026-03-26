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

        const res = await fetch('https://auth.contaazul.com/oauth2/token', {
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
        } else {
            const errBody = await res.text();
            console.error(`[AUTH] Refresh failed for ${tenant.id}:`, errBody);
            throw new Error(`Conexão expirada com Conta Azul (Refresh Failed). Por favor, reconecte a empresa.`);
        }
    }
    return { token: tenant.accessToken, tenant };
}

// Lógica de Sincronização Simplificada (Versão de Estabilização)
export async function fetchRealizedValues(accessToken: string, targetYear: number, costCenterId: string, viewMode: 'caixa' | 'competencia' = 'competencia', tenantId: string): Promise<Record<string, number>> {
    const values: Record<string, number> = {};
    const isCaixa = viewMode === 'caixa';
    const startStr = `${targetYear}-01-01`;
    const endStr = `${targetYear}-12-31`;
    
    const dateParam = isCaixa ? 'data_pagamento' : 'data_competencia';
    
    const urls = [
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/vendas?data_emissao_de=${startStr}&data_emissao_ate=${endStr}&tamanho_pagina=100`
    ];

    for (const url of urls) {
        await aggregateTransactions(accessToken, url, values, url.includes('pagar'), costCenterId, targetYear, viewMode, tenantId);
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
    
    // Sync Categories
    try {
        const catRes = await fetch(`https://api-v2.contaazul.com/v1/categorias?tamanho_pagina=100`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (catRes.ok) {
            const data = await catRes.json();
            const items = data.itens || [];
            for (const item of items) {
                await (prisma.category as any).upsert({
                    where: { id: item.id },
                    update: { name: item.name, parentId: item.categoria_pai?.id },
                    create: { id: item.id, name: item.name, tenantId, parentId: item.categoria_pai?.id, type: 'OTHER' }
                });
            }
        }
    } catch (e) {}

    // Sync Cost Centers
    try {
        const ccRes = await fetch(`https://api-v2.contaazul.com/v1/centro-de-custo`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (ccRes.ok) {
            const data = await ccRes.json();
            const items = Array.isArray(data) ? data : (data.itens || []);
            for (const item of items) {
                await (prisma.costCenter as any).upsert({
                    where: { id: item.id },
                    update: { name: item.name },
                    create: { id: item.id, name: item.name, tenantId }
                });
            }
        }
    } catch (e) {}

    return { success: true };
}

async function aggregateTransactions(accessToken: string, url: string, targetValues: Record<string, number>, isExpense: boolean, costCenterIdString: string, targetYear: number, viewMode: string, tenantId: string) {
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!res.ok) return;
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);

        for (const item of items) {
            const amount = item.valor_total || item.total || item.valor || item.pago || 0;
            const dateStr = item.data_competencia || item.data_emissao || item.venda_em || item.data_pagamento;
            if (!dateStr) continue;
            const dateObj = new Date(dateStr);
            if (dateObj.getFullYear() !== targetYear) continue;

            const monthIdx = dateObj.getMonth();
            const ccs = item.centros_de_custo || [];
            const categories = item.categorias || (item.categoria ? [item.categoria] : []);
            
            if (categories.length > 0) {
                const catToUse = categories[0];
                const catId = catToUse.id || catToUse.categoria_id;
                const catValue = amount;

                if (ccs.length === 0) {
                    const key = `${catId}|NONE-${monthIdx}`;
                    targetValues[key] = (targetValues[key] || 0) + catValue;
                } else {
                    ccs.forEach((c: any) => {
                        const ccId = c.id;
                        const percent = (c.percentual || (100 / ccs.length)) / 100;
                        const key = `${catId}|${ccId}-${monthIdx}`;
                        targetValues[key] = (targetValues[key] || 0) + (catValue * percent);
                    });
                }
            }
        }
    } catch (e) {}
}
