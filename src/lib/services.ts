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
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${targetYear}-01-01&data_vencimento_ate=${targetYear}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${targetYear}-01-01&data_vencimento_ate=${targetYear}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`
    ];

    for (const url of urls) {
        await aggregateTransactions(accessToken, url, values, url.includes('pagar'), costCenterId, targetYear, viewMode, tenantId);
    }

    return values;
}

export async function syncRealizedEntries(
    tenantId: string,
    year: number,
    viewMode: 'caixa' | 'competencia' = 'competencia',
    startMonth: number = 1,
    endMonth: number = 12
) {
    const { token } = await getValidAccessToken(tenantId);

    const entriesToSave: any[] = [];

    // Busca mês a mês para maior precisão e controle
    for (let month = startMonth; month <= endMonth; month++) {
        const paddedMonth = month.toString().padStart(2, '0');
        const startStr = `${year}-${paddedMonth}-01`;
        // Último dia do mês
        const lastDay = new Date(year, month, 0).getDate();
        const endStr = `${year}-${paddedMonth}-${lastDay}`;
        const dateParam = viewMode === 'caixa' ? 'data_pagamento' : 'data_competencia';

        const urls = [
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`
        ];

        const monthValues: Record<string, number> = {};
        for (const url of urls) {
            await aggregateTransactions(token, url, monthValues, url.includes('pagar'), 'DEFAULT', year, viewMode, tenantId);
        }

        for (const [key, amount] of Object.entries(monthValues)) {
            const lastHyphen = key.lastIndexOf('-');
            if (lastHyphen === -1) continue;
            const idsPart = key.substring(0, lastHyphen);
            const monthIdxStr = key.substring(lastHyphen + 1);
            const [catId, ccId] = idsPart.split('|');
            const monthIdx = parseInt(monthIdxStr, 10);
            if (isNaN(monthIdx)) continue;
            
            // Garante que só salvamos registros do mês que está sendo processado
            if (monthIdx + 1 !== month) continue;

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
    }

    // ⚠️ PROTEÇÃO CRÍTICA: Apaga SOMENTE registros que vieram da API (externalId LIKE 'sync-%')
    // dentro do intervalo de meses solicitado. Dados do Excel (externalId = NULL) NUNCA são tocados.
    await prisma.realizedEntry.deleteMany({
        where: {
            tenantId,
            year,
            viewMode,
            month: { gte: startMonth, lte: endMonth },
            externalId: { startsWith: 'sync-' }
        }
    });

    if (entriesToSave.length > 0) {
        await prisma.realizedEntry.createMany({ data: entriesToSave, skipDuplicates: true });
    }

    return { success: true, count: entriesToSave.length, months: `${startMonth}-${endMonth}` };
}


export async function syncMasterData(tenantId: string) {
    const { token } = await getValidAccessToken(tenantId);
    
    // Sync Categories
    try {
        let pagina = 1;
        let hasMore = true;
        while (hasMore) {
            const catRes = await fetch(`https://api-v2.contaazul.com/v1/categorias?tamanho_pagina=100&pagina=${pagina}`, { 
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            if (catRes.ok) {
                const data = await catRes.json();
                const items = data.itens || [];
                if (items.length === 0) break;
                
                for (const item of items) {
                    const existing = await prisma.category.findUnique({ where: { id: item.id } });
                    let finalName = item.name;
                    if (existing) {
                        const isLocalInactive = existing.name.toUpperCase().includes('[INATIVO]');
                        const isRemoteInactive = item.name.toUpperCase().includes('[INATIVO]');
                        if (isLocalInactive && !isRemoteInactive) {
                            finalName = `[INATIVO] ${item.name}`;
                        }
                    }

                    await (prisma.category as any).upsert({
                        where: { id: item.id },
                        update: { name: finalName, parentId: item.categoria_pai?.id },
                        create: { id: item.id, name: finalName, tenantId, parentId: item.categoria_pai?.id, type: 'OTHER' }
                    });
                }
                
                if (items.length < 100) hasMore = false;
                pagina++;
            } else {
                hasMore = false;
            }
        }
    } catch (e) {}

    // Sync Cost Centers
    try {
        let pagina = 1;
        let hasMore = true;
        while (hasMore) {
            const ccRes = await fetch(`https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100&pagina=${pagina}`, { 
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            if (ccRes.ok) {
                const data = await ccRes.json();
                const items = Array.isArray(data) ? data : (data.itens || []);
                if (items.length === 0) break;

                for (const item of items) {
                    const existing = await prisma.costCenter.findUnique({ where: { id: item.id } });
                    let finalName = item.name;
                    if (existing) {
                        const isLocalInactive = existing.name.toUpperCase().includes('[INATIVO]');
                        const isRemoteInactive = item.name.toUpperCase().includes('[INATIVO]');
                        if (isLocalInactive && !isRemoteInactive) {
                            finalName = `[INATIVO] ${item.name}`;
                        }
                    }

                    await (prisma.costCenter as any).upsert({
                        where: { id: item.id },
                        update: { name: finalName },
                        create: { id: item.id, name: finalName, tenantId }
                    });
                }

                if (items.length < 100) hasMore = false;
                pagina++;
            } else {
                hasMore = false;
            }
        }
    } catch (e) {}

    return { success: true };
}

async function aggregateTransactions(accessToken: string, url: string, targetValues: Record<string, number>, isExpense: boolean, costCenterIdString: string, targetYear: number, viewMode: string, tenantId: string) {
    let pagina = 1;
    let hasMore = true;
    
    while (hasMore) {
        const pagedUrl = `${url}&pagina=${pagina}`;
        const res = await fetch(pagedUrl, { 
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            const endpointName = url.split('/v1/')[1]?.split('?')[0] || 'api';
            throw new Error(`[Conta Azul API] ${endpointName} retornou status ${res.status}: ${errBody}`);
        }
        
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
        if (items.length === 0) break;

        for (const item of items) {
            const amount = item.valor_total || item.total || item.valor || item.pago || 0;
            const dateStr = item.data_competencia || item.data_emissao || item.venda_em || item.data_pagamento || item.data;
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
        
        if (items.length < 100) hasMore = false;
        pagina++;
    }
}
