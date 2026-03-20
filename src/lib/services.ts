import { prisma } from './prisma';

// Ensure standard database schema for multitenancy
async function ensureTenantSchema() {
    try {
        await (prisma as any).$executeRaw`ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "entradaDreLocal" TEXT`;
        await (prisma as any).$executeRaw`ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "parentIdLocal" TEXT`;
    } catch (e) {
        // Ignorar se já existir ou se o Prisma carregar o esquema atualizado
    }
}

async function refreshAccessToken(refreshToken: string) {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://api.contaazul.com/oauth2/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    if (!res.ok) {
        throw new Error(`Failed to refresh token: ${res.statusText}`);
    }

    return await res.json();
}

// --------------------------------------------------------
// Helpers de Autenticação
// --------------------------------------------------------

export async function getValidAccessToken(tenantId?: string) {
    await ensureTenantSchema();
    const tenant = tenantId
        ? await prisma.tenant.findUnique({ where: { id: tenantId } })
        : await prisma.tenant.findFirst();

    if (!tenant) throw new Error("No connected tenant found");

    if (tenant.accessToken === 'test-token') {
        throw new Error("⚠️ MODO DE TESTE: Use o botão Azul para conectar de verdade.");
    }

    if (tenant.tokenExpiresAt && new Date(tenant.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000) {
        if (!tenant.refreshToken) throw new Error("Refresh token missing");
        console.log(`Token expired for tenant ${tenant.name}, refreshing...`);
        const newToken = await refreshAccessToken(tenant.refreshToken);

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

    if (!tenant.accessToken) throw new Error("Access token missing");
    return { token: tenant.accessToken, tenant };
}

// --------------------------------------------------------
// Lógica de Sincronização e Agregação (V47.10.5)
// --------------------------------------------------------

export async function fetchRealizedValues(accessToken: string, targetYear: number, costCenterId: string, viewMode: 'caixa' | 'competencia' = 'competencia', tenantId: string): Promise<Record<string, number>> {
    const values: Record<string, number> = {};
    const isCaixa = viewMode === 'caixa';
    
    // Filtros de Data Amplos para garantir captura
    const startStr = `${targetYear}-01-01`;
    const endStr = `${targetYear}-12-31`;
    
    // Parâmetro principal por modo
    const dateParam = isCaixa ? 'data_pagamento' : 'data_competencia';
    
    // URLs de busca
    const endpoints = [
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        // Fallbacks V1
        `https://api.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
    ];

    for (const url of endpoints) {
        await aggregateTransactions(accessToken, url, values, url.includes('pagar'), costCenterId, targetYear, viewMode, tenantId);
    }

    // Se ainda vazio, modo "Brute Force" (Sem filtros de data na URL)
    if (Object.keys(values).length === 0) {
        console.log(`[SYNC-BRUTE] Tentando modo Brute Force para ${tenantId}`);
        const bruteUrls = [
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?tamanho_pagina=100`
        ];
        for (const url of bruteUrls) {
            await aggregateTransactions(accessToken, url, values, url.includes('pagar'), costCenterId, targetYear, viewMode, tenantId);
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
            amount: Math.abs(amount), // Sempre positivo para DRE
            viewMode,
            externalId: `sync-${tenantId}-${catId}-${ccId || 'NONE'}-${year}-${monthIdx}-${viewMode}`,
            description: `Sincronização ${viewMode}`
        });
    }

    // Limpa e salva
    await prisma.realizedEntry.deleteMany({ where: { tenantId, year, viewMode } });
    if (entriesToSave.length > 0) {
        await prisma.realizedEntry.createMany({ data: entriesToSave, skipDuplicates: true });
    }

    return { success: true, count: entriesToSave.length, tenantId, year, viewMode };
}

async function aggregateTransactions(
    accessToken: string,
    baseUrl: string,
    targetValues: Record<string, number>,
    isExpense = false,
    costCenterIdString: string = 'DEFAULT',
    targetYear: number,
    viewMode: 'caixa' | 'competencia' = 'competencia',
    tenantId: string
) {
    const targetCcs = costCenterIdString.split(',').map(id => id.trim()).filter(id => id !== 'DEFAULT' && id !== 'Geral' && id !== '');
    const isFiltered = targetCcs.length > 0;

    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 5) { // Limite de 5 páginas para evitar timeout
        const url = `${baseUrl}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) { hasMore = false; break; }

            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.itens || data.items || data.eventos || []);
            if (items.length === 0) { hasMore = false; break; }

            for (const item of items) {
                let amount: number;
                let dateStr: string;

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    const isPaid = (item.status || '').toUpperCase() === 'BAIXADO' || (item.pago && item.pago > 0);
                    if (!isPaid) continue;
                    amount = item.pago || item.valor_pago || item.total || item.valor || 0;
                } else {
                    amount = item.valor_original || item.total || item.valor || item.pago || 0;
                    dateStr = item.data_competencia || item.data_emissao || item.venda_em || item.vencimento;
                }

                if (!dateStr) continue;
                let dateObj = new Date(dateStr);
                const year = dateObj.getFullYear();
                if (year !== targetYear) continue;

                const monthIdx = dateObj.getMonth();
                const status = (item.status || '').toUpperCase();
                if (status.includes('CANCEL')) continue;

                let ccs = item.centros_de_custo || [];
                // Se filtrado, pula itens que não batem com nenhum CC alvo
                if (isFiltered && !ccs.some((c: any) => targetCcs.includes(c.id))) continue;

                const categories = item.categorias || [];
                if (categories.length > 0) {
                    const leafCats = categories.filter((c: any) => !categories.some((other: any) => other.parent_id === c.id));
                    const finalCats = leafCats.length > 0 ? leafCats : [categories[0]];

                    for (const cat of finalCats) {
                        const catId = `${tenantId}:${cat.id}`;
                        const catValue = Math.abs(typeof cat.valor === 'number' ? cat.valor : (amount / finalCats.length));

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
            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e: any) { hasMore = false; break; }
    }
}

// V47.10.6: Compatibilidade de Build (Resolve erro no Vercel)
export async function syncData() {
    const { runCronSync } = await import('./cronSync');
    return await runCronSync(new Date().getFullYear());
}
