import { prisma } from './prisma';
import { refreshAccessToken } from './contaazul';

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

async function fetchHybrid(
    accessToken: string, 
    v1Url: string,
    v2Url: string,
    endpointName: string,
    targetYear: number, 
    pushLog?: (msg: string) => void
): Promise<any[]> {
    const allItems: any[] = [];
    
    // TRY V1 FIRST (Legacy but often more compatible with upgraded tokens)
    try {
        const fullV1 = `${v1Url}${v1Url.includes('?') ? '&' : '?'}page=1`;
        const resV1 = await fetch(fullV1, { 
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } 
        });
        if (resV1.ok) {
            const data = await resV1.json();
            const items = Array.isArray(data) ? data : (data.items || data.sales || []);
            if (items.length > 0) {
                if (pushLog) pushLog(`[SYNC] ${endpointName} encontrada em V1!`);
                // Simple parser for V1 (assuming DD/MM/YYYY or ISO)
                for (const item of items) {
                    const dateStr = item.data_venda || item.data_liquidacao || item.data || item.emission_date;
                    if (!dateStr) continue;
                    const date = new Date(dateStr.split('/').reverse().join('-')); // Try BR to ISO conversion
                    if (date.getFullYear() === targetYear) {
                        allItems.push({
                            id: item.id,
                            description: item.descricao || item.cliente || 'V1 Item',
                            amount: item.valor || item.valor_liquido || 0,
                            month: date.getMonth() + 1
                        });
                    }
                }
                return allItems;
            }
        }
    } catch (e) {}

    // FALLBACK TO V2
    try {
        const resV2 = await fetch(v2Url, { 
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } 
        });
        if (resV2.ok) {
            const data = await resV2.json();
            const items = Array.isArray(data) ? data : (data.items || data.sales || []);
            for (const item of items) {
                const dateStr = item.emission_date || item.date || item.due_date;
                const date = new Date(dateStr);
                if (date.getUTCFullYear() === targetYear) {
                    allItems.push({
                        id: item.id,
                        description: item.description || item.customer_name || 'V2 Item',
                        amount: item.total || item.value || 0,
                        month: date.getUTCMonth() + 1
                    });
                }
            }
        } else {
            const err = await resV2.text();
            if (pushLog) pushLog(`[SYNC ERROR] ${endpointName} V2 fail: ${resV2.status} ${err.substring(0,20)}`);
        }
    } catch (e) {}

    return allItems;
}

export async function runCronSync(reqYear: number, tenantId?: string) {
    const logs: string[] = [];
    const pushLog = (msg: string) => logs.push(msg);

    const tenants = await prisma.tenant.findMany();
    const allCategories = await prisma.category.findMany();

    const catMap = new Map<string, string>();
    allCategories.forEach(c => {
        const rawId = c.id.includes(':') ? c.id.split(':')[1] : c.id;
        catMap.set(rawId, c.id);
    });

    const report: any[] = [];
    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;

    for (const t of targets) {
        try {
            pushLog(`[SYNC] [${t.name}] Iniciando...`);
            const token = await getValidAccessToken(t.id);

            for (const viewMode of ['competencia', 'caixa'] as const) {
                const entriesMap = new Map<string, any>();
                
                // DEFINE HYBRID ENDPOINTS
                const probeSales = await fetchHybrid(token, 
                    'https://api.contaazul.com/v1/vendas/buscar', 
                    `https://api.contaazul.com/v2/sales?emission_date_start=${reqYear}-01-01T00:00:00Z&emission_date_end=${reqYear}-12-31T23:59:59Z`,
                    'Vendas', reqYear, pushLog
                );

                const probeIn = await fetchHybrid(token, 
                    'https://api.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar', 
                    `https://api.contaazul.com/v2/financials/receivables?settlement_date_start=${reqYear}-01-01T00:00:00Z&settlement_date_end=${reqYear}-12-31T23:59:59Z`,
                    'Recebimentos', reqYear, pushLog
                );

                const probeOut = await fetchHybrid(token, 
                    'https://api.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar', 
                    `https://api.contaazul.com/v2/financials/payables?settlement_date_start=${reqYear}-01-01T00:00:00Z&settlement_date_end=${reqYear}-12-31T23:59:59Z`,
                    'Pagamentos', reqYear, pushLog
                );

                const allFound = [...probeSales, ...probeIn, ...probeOut];

                for (const tx of allFound) {
                    const ek = `${tx.id}:${viewMode}`;
                    if (entriesMap.has(ek)) {
                        entriesMap.get(ek).amount += tx.amount;
                    } else {
                        entriesMap.set(ek, {
                            tenantId: t.id,
                            categoryId: 'SYSTEM_GENERIC_REVENUE', // Placeholder
                            costCenterId: null,
                            year: reqYear,
                            month: tx.month,
                            amount: tx.amount,
                            viewMode: viewMode,
                            externalId: tx.id,
                            description: tx.description
                        });
                    }
                }

                const entriesToSave = Array.from(entriesMap.values());
                await prisma.realizedEntry.deleteMany({
                    where: { tenantId: t.id, year: reqYear, viewMode: viewMode }
                });

                if (entriesToSave.length > 0) {
                    await prisma.realizedEntry.createMany({ data: entriesToSave });
                }
                report.push({ tenant: t.name, mode: viewMode, count: entriesToSave.length });
            }
        } catch (err: any) {
            pushLog(`[ERROR] [${t.name}] ${err.message}`);
            report.push({ tenant: t.name, error: err.message });
        }
    }
    return { report, logs };
}
