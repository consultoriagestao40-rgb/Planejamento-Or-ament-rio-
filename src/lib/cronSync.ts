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

async function fetchAllTransactionsV2(
    accessToken: string, 
    url: string, 
    endpointName: string,
    targetYear: number, 
    pushLog?: (msg: string) => void
): Promise<any[]> {
    let page = 1;
    let hasMore = true;
    const allItems: any[] = [];

    while (hasMore) {
        try {
            const separator = url.includes('?') ? '&' : '?';
            const fullUrl = `${url}${separator}page=${page}&size=100`;
            const res = await fetch(fullUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            
            if (!res.ok) {
                if (pushLog) pushLog(`[V2 ERROR] ${endpointName} (P${page}) Status: ${res.status}`);
                break;
            }
            
            const data = await res.json();
            // V2 usually returns array directly or inside "items"
            const itemList = Array.isArray(data) ? data : (data.items || data.sales || []);

            if (itemList.length === 0) {
                hasMore = false;
                break;
            }

            for (const item of itemList) {
                // V2 Date Fields: "emission_date", "date", "due_date", "settlement_date"
                const dateStr = item.emission_date || item.date || item.due_date || item.settlement_date;
                if (!dateStr) continue;

                const date = new Date(dateStr);
                const itemYear = date.getUTCFullYear();
                const itemMonth = date.getUTCMonth() + 1;

                if (itemYear !== targetYear) continue;

                // V2 Amount: "total", "value", "net_value"
                const amount = item.total || item.total_value || item.value || 0;

                allItems.push({
                    id: item.id,
                    description: item.description || item.customer_name || item.memo || 'V2 SYNC',
                    amount: amount,
                    month: itemMonth,
                    categories: item.categories || [],
                    costCenters: item.cost_centers || []
                });
            }

            if (itemList.length < 100) hasMore = false;
            else page++;
            if (page > 100) hasMore = false;
        } catch (e) { hasMore = false; }
    }
    return allItems;
}

export async function runCronSync(reqYear: number, tenantId?: string) {
    const logs: string[] = [];
    const pushLog = (msg: string) => logs.push(msg);

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

    const report: any[] = [];
    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;

    for (const t of targets) {
        try {
            pushLog(`[SYNC] [${t.name}] Verificando tokens V2...`);
            const token = await getValidAccessToken(t.id);
            pushLog(`[SYNC] [${t.name}] Token renovado. Explorando V2...`);

            for (const viewMode of ['competencia', 'caixa'] as const) {
                const startStr = `${reqYear-1}-01-01T00:00:00Z`;
                const endStr = `${reqYear+1}-12-31T23:59:59Z`;

                // V2 ENDPOINTS
                const endpoints = viewMode === 'caixa' ? [
                    { name: 'Financials-In', url: 'https://api.contaazul.com/v2/financials/receivables', isExpense: false },
                    { name: 'Financials-Out', url: 'https://api.contaazul.com/v2/financials/payables', isExpense: true }
                ] : [
                    { name: 'Sales', url: 'https://api.contaazul.com/v2/sales', isExpense: false },
                    { name: 'Financials-In', url: 'https://api.contaazul.com/v2/financials/receivables', isExpense: false },
                    { name: 'Financials-Out', url: 'https://api.contaazul.com/v2/financials/payables', isExpense: true }
                ];

                const entriesMap = new Map<string, any>();
                let firstItemInfo = '';

                for (const ep of endpoints) {
                    // V2 Filter Params
                    let dateParams = '';
                    if (ep.name === 'Sales') {
                        dateParams = `emission_date_start=${startStr}&emission_date_end=${endStr}`;
                    } else {
                        dateParams = viewMode === 'caixa'
                            ? `settlement_date_start=${startStr}&settlement_date_end=${endStr}`
                            : `due_date_start=${startStr}&due_date_end=${endStr}`;
                    }

                    const items = await fetchAllTransactionsV2(token, ep.url + '?' + dateParams, ep.name, reqYear, pushLog);
                    
                    if (items.length > 0 && !firstItemInfo) {
                        const it = items[0];
                        firstItemInfo = `[V2:${ep.name}] ID:${it.id} M:${it.month}`;
                    }

                    for (const tx of items) {
                        if (tx.month === 0) continue;

                        let mainCatId = tx.categories?.[0]?.id;
                        let mainCatName = tx.categories?.[0]?.name;
                        const mainCcId = tx.costCenters?.[0]?.id;

                        if (!mainCatId) mainCatId = 'SYSTEM_GENERIC_REVENUE';

                        if (!catMap.has(mainCatId)) {
                            const newCatName = mainCatName || 'Importado CA V2';
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
            pushLog(`[ERROR] [${t.name}] ${err.message}`);
            report.push({ tenant: t.name, error: err.message });
        }
    }
    return { report, logs };
}
