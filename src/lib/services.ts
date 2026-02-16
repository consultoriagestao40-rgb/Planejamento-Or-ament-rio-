import { prisma } from '@/lib/prisma';
import { refreshAccessToken } from './contaazul';

// Types (Basic definitions based on standard CA API structure)
interface ContaAzulCategory {
    id: string;
    name: string;
}

interface ContaAzulCostCenter {
    id: string;
    name: string;
}

interface ContaAzulSale {
    id: string;
    emission_date: string;
    value: number;
    status: string; // 'committed' | 'pending'
    customer?: { name: string };
}

// Helper to get a valid access token
async function getValidAccessToken() {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("No connected tenant found");

    if (tenant.accessToken === 'test-token') {
        throw new Error("⚠️ MODO DE TESTE: Você usou o botão de teste. Limpe o banco e use o botão Azul para conectar de verdade.");
    }

    // Check if expired (give 5 min buffer)
    if (tenant.tokenExpiresAt && new Date(tenant.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000) {
        if (!tenant.refreshToken) {
            throw new Error("Refreh token is missing, please reconnect.");
        }
        console.log("Token expired, refreshing...");
        const newToken = await refreshAccessToken(tenant.refreshToken);

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                accessToken: newToken.access_token,
                refreshToken: newToken.refresh_token,
                tokenExpiresAt: new Date(Date.now() + newToken.expires_in * 1000)
            }
        });
        return newToken.access_token;
    }

    if (!tenant.accessToken) {
        throw new Error("Access token is missing. Please reconnect.");
    }

    return tenant.accessToken;
}

// --------------------------------------------------------
// Data Fetching Functions
// --------------------------------------------------------

async function fetchUserInfo(accessToken: string) {
    const urls = [
        'https://api-v2.contaazul.com/v1/user/info',
        'https://api.contaazul.com/v1/user/info',
        'https://api-v2.contaazul.com/v1/tenants'
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) return await res.json();
            console.warn(`UserInfo failed (${url}): ${res.status}`);
        } catch (e) { }
    }
    return { error: 'Could not fetch user/tenant info' };
}

export async function syncData() {
    let accessToken: string;
    try {
        accessToken = await getValidAccessToken();
    } catch (e: any) {
        console.error("Auth failed during sync:", e);
        return { success: false, error: `Auth Error: ${e.message}`, timestamp: new Date().toISOString() };
    }

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return { success: false, error: "Tenant not found in DB", timestamp: new Date().toISOString() };

    console.log("Starting syncData V36 (Discovery Mode)...");

    // Discovery step: Who are we?
    const userInfo = await fetchUserInfo(accessToken);

    let categories: any[] = [];
    let costCenters: any[] = [];
    let fetchError: string | null = null;

    try {
        const results = await Promise.all([
            fetchCategories(accessToken).catch(e => { fetchError = `Categories: ${e.message}`; return []; }),
            fetchCostCenters(accessToken).catch(e => { fetchError = `CostCenters: ${e.message}`; return []; })
        ]);
        categories = results[0];
        costCenters = results[1];
    } catch (e: any) {
        fetchError = `Total Fetch Error: ${e.message}`;
    }

    const report = {
        categoriesSuccess: 0,
        categoriesFailed: 0,
        costCentersSuccess: 0,
        costCentersFailed: 0,
        lastError: fetchError,
        rawApiError: (global as any).lastApiError || 'none recorded'
    };

    // Persist Cost Centers with individual try/catch
    for (const cc of costCenters) {
        try {
            const ccId = cc.id;
            const ccName = cc.nome || cc.name;
            if (!ccId || !ccName) continue;

            await (prisma as any).costCenter.upsert({
                where: { id: ccId },
                create: { id: ccId, name: ccName, tenantId: tenant.id },
                update: { name: ccName }
            });
            report.costCentersSuccess++;
        } catch (e: any) {
            report.costCentersFailed++;
            report.lastError = `CC Upsert Error (${cc.id}): ${e.message}`;
        }
    }

    // Persist Categories with individual try/catch
    for (const cat of categories) {
        try {
            const catId = cat.id;
            const catName = cat.nome || cat.name;
            if (!catId || !catName) continue;

            const parentId = cat.categoria_pai || cat.parent_id || null;
            const typeValue = cat.tipo || cat.type || 'EXPENSE';
            let entradaDre = cat.entrada_dre || cat.entry_dre || null;

            // V46.5: Inherit metadata from parent if missing (crucial for summing children)
            if (!entradaDre && parentId) {
                const parent = categories.find(c => c.id === parentId);
                if (parent) {
                    entradaDre = parent.entrada_dre || parent.entry_dre || null;
                }
            }

            await (prisma as any).category.upsert({
                where: { id: catId },
                create: {
                    id: catId,
                    name: catName,
                    tenantId: tenant.id,
                    parentId: parentId,
                    type: typeValue,
                    entradaDre: entradaDre
                },
                update: {
                    name: catName,
                    parentId: parentId,
                    type: typeValue,
                    entradaDre: entradaDre
                }
            });
            report.categoriesSuccess++;
        } catch (e: any) {
            report.categoriesFailed++;
            report.lastError = `Cat Upsert Error (${cat.id}): ${e.message}`;
        }
    }

    // Help debug: Try to decode token
    let grantedScopes = 'unknown';
    let fullTokenPayload = null;
    try {
        const payload = accessToken.split('.')[1];
        if (payload) {
            fullTokenPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
            grantedScopes = fullTokenPayload.scope || fullTokenPayload.authorities || 'none found in JWT';
        }
    } catch (e) {
        grantedScopes = 'not a JWT or decode failed';
    }

    // V45: Fetch Realized Values (Balances)
    let realizedValues: Record<string, number> = {};
    const transactionLogs: string[] = [];
    try {
        (global as any).lastTransactionLogs = transactionLogs; // Pass the array to be filled
        realizedValues = await fetchRealizedValues(accessToken);
    } catch (e: any) {
        console.warn("Could not fetch realized values:", e);
        transactionLogs.push(`Fatal Error: ${e.message}`);
    }

    return {
        success: true,
        timestamp: new Date().toISOString(),
        categoriesCount: categories.length,
        costCentersCount: costCenters.length,
        realizedValues,
        report,
        discovery: {
            userInfo,
            grantedScopes,
            fullPayload: fullTokenPayload,
            transactionLogs: (global as any).lastTransactionLogs || []
        },
        debug: {
            rawCategoriesResponse: (global as any).lastCategoriesRaw || 'none',
            rawCostCentersResponse: (global as any).lastCostCentersRaw || 'none',
            firstCategory: categories[0] ? JSON.stringify(categories[0]) : 'none',
            rawCategoriesSample: JSON.stringify(categories).substring(0, 500)
        }
    };
}

// V46: Aggregates settled transactions from Payables and Receivables
async function fetchRealizedValues(accessToken: string): Promise<Record<string, number>> {
    const values: Record<string, number> = {};
    const currentYear = new Date().getFullYear();

    // Widen range to capture historical data for visual validation (2024, 2025, 2026)
    const ranges = [
        { start: `${currentYear}-01-01`, end: `${currentYear}-12-31` },
        { start: `${currentYear - 1}-01-01`, end: `${currentYear - 1}-12-31` },
        { start: '2024-01-01', end: '2024-12-31' }
    ];

    for (const range of ranges) {
        // 1. Fetch Receivables
        await aggregateTransactions(
            accessToken,
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_pagamento_de=${range.start}&data_pagamento_ate=${range.end}&tamanho_pagina=100`,
            values
        );

        // 2. Fetch Payables
        await aggregateTransactions(
            accessToken,
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_pagamento_de=${range.start}&data_pagamento_ate=${range.end}&tamanho_pagina=100`,
            values,
            true // isExpense
        );
    }

    return values;
}

async function aggregateTransactions(accessToken: string, baseUrl: string, targetValues: Record<string, number>, isExpense = false) {
    let page = 1;
    let hasMore = true;
    const logs = (global as any).lastTransactionLogs || [];

    while (hasMore && page <= 20) {
        const url = `${baseUrl}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) {
                const errText = await res.text();
                console.warn(`Transaction API failed (${res.status}): ${errText}`);
                (global as any).lastApiError = `Transaction API ${res.status}: ${errText.substring(0, 200)}`;
                logs.push(`FAILED ${url}: ${res.status} - ${errText.substring(0, 100)}`);
                hasMore = false;
                break;
            }

            const data = await res.json();
            const items = data.itens || [];
            logs.push(`SUCCESS ${url}: Found ${items.length} items`);

            if (items.length === 0) { hasMore = false; break; }

            items.forEach((item: any) => {
                const dateStr = item.data_pagamento;
                if (!dateStr) return;

                const dateObj = new Date(dateStr);
                const monthIdx = dateObj.getMonth();
                const year = dateObj.getFullYear();

                // For V46.5: We allow 2024, 2025 and 2026 to be aggregated into the month slots
                // This ensures that even if 2026 is empty, we see that the data flow works.
                if (year < 2024 || year > 2026) return;

                const amount = item.valor || item.total || 0;
                const categories = item.categorias || [];

                categories.forEach((catRef: any) => {
                    const catId = catRef.id;
                    if (catId) {
                        const key = `${catId}-${monthIdx}`;
                        targetValues[key] = (targetValues[key] || 0) + (isExpense ? amount : amount);
                        // Signs are handled in DRE math by BudgetGrid (abs subtraction)
                    }
                });
            });

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e: any) {
            console.error("Aggregation crash:", e);
            (global as any).lastApiError = `Aggregation Crash: ${e.message}`;
            logs.push(`CRASH ${url}: ${e.message}`);
            hasMore = false;
        }
    }
}

async function fetchCategories(accessToken: string) {
    let allItems: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) { // Safety limit of 10 pages
        const url = `https://api-v2.contaazul.com/v1/categorias?pagina=${page}&tamanho_pagina=100`;
        try {
            console.log(`Fetching categories page ${page}`);
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            const data = await res.json();

            if (res.ok) {
                const items = Array.isArray(data) ? data : (data.itens || data.items || data.categorias || []);
                if (items.length > 0) {
                    allItems = [...allItems, ...items];
                    // Se o número de itens for menor que o tamanho da página, não há mais
                    if (items.length < 100) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
                (global as any).lastApiError = `Categories Page ${page} failed: ${res.status}`;
            }
        } catch (e) {
            hasMore = false;
            console.warn(`Error on categories page ${page}:`, e);
        }
    }

    if (allItems.length > 0) {
        (global as any).lastCategoriesRaw = JSON.stringify(allItems).substring(0, 1000);
    }
    return allItems;
}

async function fetchCostCenters(accessToken: string) {
    let allItems: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
        const url = `https://api-v2.contaazul.com/v1/centro-de-custo?pagina=${page}&tamanho_pagina=100`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            const data = await res.json();

            if (res.ok) {
                const items = Array.isArray(data) ? data : (data.itens || data.items || data.centro_de_custos || data.centro_custo || []);
                if (items.length > 0) {
                    allItems = [...allItems, ...items];
                    if (items.length < 100) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        } catch (e) {
            hasMore = false;
        }
    }

    if (allItems.length > 0) {
        (global as any).lastCostCentersRaw = JSON.stringify(allItems).substring(0, 1000);
    }
    return allItems;
}

// Removing fetchSales as the focus is on DRE structure (Categories/Cost Centers) for now
// and sales might require a different sync logic into BudgetEntry.
