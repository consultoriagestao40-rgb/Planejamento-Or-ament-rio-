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
export async function getValidAccessToken(tenantId?: string) {
    const tenant = tenantId
        ? await prisma.tenant.findUnique({ where: { id: tenantId } })
        : await prisma.tenant.findFirst();

    if (!tenant) throw new Error("No connected tenant found");

    if (tenant.accessToken === 'test-token') {
        throw new Error("⚠️ MODO DE TESTE: Você usou o botão de teste. Limpe o banco e use o botão Azul para conectar de verdade.");
    }

    // Check if expired (give 5 min buffer)
    if (tenant.tokenExpiresAt && new Date(tenant.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000) {
        if (!tenant.refreshToken) {
            throw new Error("Refresh token is missing, please reconnect.");
        }
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

    if (!tenant.accessToken) {
        throw new Error("Access token is missing. Please reconnect.");
    }

    return { token: tenant.accessToken, tenant };
}

// --------------------------------------------------------
// Data Fetching Functions
// --------------------------------------------------------

async function fetchUserInfo(accessToken: string) {
    const urls = [
        'https://api-v2.contaazul.com/v1/user/info',
        'https://api.contaazul.com/v1/user/info',
        'https://api-v2.contaazul.com/v1/tenants',
        'https://api.contaazul.com/v1/tenants'
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                const data = await res.json();
                console.log(`[SYNC] Tenant Info Object found at ${url}`);
                const tenantData = Array.isArray(data) ? data[0] : (data.tenant || data);
                if (tenantData?.nome || tenantData?.name || tenantData?.razao_social) {
                    return tenantData;
                }
            } else {
                console.warn(`[SYNC] UserInfo failed (${url}): ${res.status}`);
            }
        } catch (e) { }
    }
    return { error: 'Could not fetch user/tenant info' };
}

// V47.9.10: Updated signature to accept Cost Center & Year
export async function syncData(costCenterId: string = 'DEFAULT', year: number = new Date().getFullYear(), viewMode: 'caixa' | 'competencia' = 'competencia', tenantId?: string) {
    let accessToken: string;
    let tenant: any;
    try {
        const result = await getValidAccessToken(tenantId);
        accessToken = result.token;
        tenant = result.tenant;
    } catch (e: any) {
        console.error("Auth failed during sync:", e);
        return { success: false, error: `Auth Error: ${e.message}`, timestamp: new Date().toISOString() };
    }

    if (!tenant) return { success: false, error: "Tenant not found in DB", timestamp: new Date().toISOString() };

    console.log(`Starting syncData V47.10 (CC=${costCenterId}, Year=${year})...`);

    // Discovery step: Who are we?
    const userInfo = await fetchUserInfo(accessToken);

    // Auto-heal "Empresa Desconhecida"
    if (tenant.name.includes('Empresa') && !tenant.name.includes('SPOT')) {
        const tenantData = Array.isArray(userInfo) ? userInfo[0] : (userInfo.tenant || userInfo);
        const realName = tenantData?.nome || tenantData?.name || tenantData?.razao_social;
        if (realName && realName !== 'Empresa') {
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: { name: realName }
            });
            tenant.name = realName;
        }
    }

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
    const costCenterIdsToKeep: string[] = [];
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
            costCenterIdsToKeep.push(ccId);
            report.costCentersSuccess++;
        } catch (e: any) {
            report.costCentersFailed++;
            report.lastError = `CC Upsert Error (${cc.id}): ${e.message}`;
        }
    }

    // Remover Centros de Custo Inativos (que não vieram na listagem atual)
    try {
        if (costCenterIdsToKeep.length > 0) {
            await prisma.costCenter.deleteMany({
                where: {
                    tenantId: tenant.id,
                    id: { notIn: costCenterIdsToKeep }
                }
            });
        }
    } catch (e: any) {
        console.warn("Falha ao remover CCs inativos:", e.message);
    }

    // V47.1: Pre-process categories for robust mapping
    // STAGE 2: STRICT MODE - Remove Heuristics. Trust API.
    const mappedCategories = categories.map(cat => {
        const name = (cat.nome || cat.name || '').trim();
        // Use ID and ParentID strictly from API
        // entradadre often comes null from CA, but we must NOT guess.
        // We will rely on the Tree Structure in the Frontend to group them.

        return {
            ...cat,
            name,
            entradaDreLocal: null, // Let the UI decide based on Root Parent 
            parentIdLocal: cat.categoria_pai?.id || cat.parent_id || cat.parentId || null // Ensure we get the ID, not the object
        };
    });

    // Persist Categories
    for (const cat of mappedCategories) {
        try {
            const catId = cat.id;
            const typeValue = cat.tipo || cat.type || 'EXPENSE';

            await (prisma as any).category.upsert({
                where: { id: catId },
                create: {
                    id: catId,
                    name: cat.name,
                    tenantId: tenant.id,
                    parentId: cat.parentIdLocal,
                    type: typeValue,
                    entradaDre: cat.entradaDreLocal
                },
                update: {
                    name: cat.name,
                    parentId: cat.parentIdLocal,
                    type: typeValue,
                    entradaDre: cat.entradaDreLocal
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
        (global as any).lastTransactionLogs = transactionLogs;
        // DEPRECATED: Realized values are no longer fetched natively on page load.
        // We now use `runCronSync` (cronsync.ts) to populate the PostgreSQL `RealizedEntry` local caching layer.
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

// V46: Aggregates transactions for DRE (Competence View - V47.9.5)
export async function fetchRealizedValues(accessToken: string, targetYear: number, costCenterId: string, viewMode: 'caixa' | 'competencia' = 'competencia'): Promise<Record<string, number>> {
    const values: Record<string, number> = {};

    // V47.9.10: Use targetYear passed from Frontend
    // Still use a buffer window to catch items with Competence in TargetYear but Due/Paid around it.
    const start = `${targetYear - 1}-01-01`;
    const end = `${targetYear + 1}-12-31`;

    // 1. Fetch Receivables (Competence/Due in Window)
    await aggregateTransactions(
        accessToken,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`,
        values,
        false,
        costCenterId,
        targetYear,
        viewMode
    );

    // 2. Fetch Payables
    await aggregateTransactions(
        accessToken,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`,
        values,
        true, // isExpense
        costCenterId,
        targetYear,
        viewMode
    );

    return values;
}

async function aggregateTransactions(
    accessToken: string,
    baseUrl: string,
    targetValues: Record<string, number>,
    isExpense = false,
    costCenterIdString: string = 'DEFAULT',
    targetYear: number,
    viewMode: 'caixa' | 'competencia' = 'competencia'
) {
    let page = 1;
    let hasMore = true;

    // Parse target cost centers into an array
    const targetCcs = costCenterIdString.split(',').map(id => id.trim()).filter(id => id !== 'DEFAULT' && id !== 'Geral' && id !== '');
    const isFiltered = targetCcs.length > 0;
    const isMultiSelect = targetCcs.length > 1;

    // Append Cost Center Filter if valid and only a SINGLE one is selected.
    // If multiple are selected, we must fetch without the filter and filter locally,
    // because the API V1 only accepts exactly one centro_custo_id via query parameter.
    let finalUrlBase = baseUrl;
    if (isFiltered && !isMultiSelect) {
        finalUrlBase += `&centro_custo_id=${targetCcs[0]}`;
    }

    // TWO-PASS RATEIO APPROACH
    type ItemBucket = { amount: number; ccCount: number };
    const singleCCByKey: Record<string, number> = {};
    const multiCCByKey: Record<string, ItemBucket[]> = {};

    while (hasMore && page <= 200) {
        const url = `${finalUrlBase}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) { hasMore = false; break; }

            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) { hasMore = false; break; }

            items.forEach((item: any) => {
                let amount: number;
                let dateStr: string;
                if (viewMode === 'caixa') {
                    amount = item.valor || item.valor_original || item.valor_liquido || item.total || 0;
                    dateStr = item.data_vencimento || item.vencimento || item.data_competencia || item.data_pagamento;
                } else {
                    amount = item.total || item.valor_original || item.valor || item.valor_liquido || 0;
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento || item.data_pagamento;
                }
                let dateObj = dateStr ? new Date(dateStr) : new Date();
                const monthIdx = dateObj.getMonth();
                const year = dateObj.getFullYear();
                if (year !== targetYear) return;

                const status = (item.status || '').toUpperCase();
                if (status.includes('CANCEL')) return;

                const ccs = item.centros_de_custo || [];

                // If filtered, the item MUST belong to AT LEAST ONE of the target CCs
                if (isFiltered) {
                    const matchesTarget = ccs.some((c: any) => targetCcs.includes(c.id));
                    if (!matchesTarget) return;
                }

                const categories = item.categorias || [];
                if (categories.length > 0) {
                    const catId = categories[0].id;
                    if (catId) {
                        const key = `${catId}-${monthIdx}`;

                        // Modified rateio logic for Multi-select:
                        // If multi-select is active, we just accumulate the proportional value of the matching CCs
                        if (isMultiSelect) {
                            // Find how many of the entry's CCs we actually want to sum
                            // Usually Conta Azul returns Umbrella transactions with N CCs. 
                            // We divide the total by N, and multiply by the number of selected CCs that match.
                            const matchingCcs = ccs.filter((c: any) => targetCcs.includes(c.id)).length;
                            const proportion = matchingCcs / (ccs.length || 1);
                            targetValues[key] = (targetValues[key] || 0) + (amount * proportion);
                        } else {
                            // Original Single-Select Logic
                            if (!isFiltered || ccs.length === 1) {
                                singleCCByKey[key] = (singleCCByKey[key] || 0) + amount;
                            } else {
                                if (!multiCCByKey[key]) multiCCByKey[key] = [];
                                multiCCByKey[key].push({ amount, ccCount: ccs.length });
                            }
                        }
                    }
                }
            });

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e: any) {
            hasMore = false;
        }
    }

    if (!isMultiSelect) {
        // Run original Merge for Single CC approach
        const allKeys = new Set([...Object.keys(singleCCByKey), ...Object.keys(multiCCByKey)]);
        for (const key of allKeys) {
            if (singleCCByKey[key] !== undefined) {
                targetValues[key] = (targetValues[key] || 0) + singleCCByKey[key];
            } else if (multiCCByKey[key]) {
                const total = multiCCByKey[key].reduce((sum, b) => sum + (b.amount / b.ccCount), 0);
                targetValues[key] = (targetValues[key] || 0) + total;
            }
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
                let items = Array.isArray(data) ? data : (data.itens || data.items || data.centro_de_custos || data.centro_custo || []);
                if (items.length > 0) {

                    // DEBUG: Capture the first item to understand the status structure
                    if (page === 1) {
                        (global as any).lastApiError = `DEBUG CC[0]: ${JSON.stringify(items[0]).substring(0, 500)}`;
                    }

                    // Filter for active CCs only. Conta Azul uses status='ATIVO' or 'INATIVO', or booleans 'ativo'/'inativo'
                    items = items.filter((i: any) => {
                        if (i.status) return i.status.toUpperCase() === 'ATIVO';
                        if (typeof i.ativo === 'boolean') return i.ativo;
                        if (typeof i.inativo === 'boolean') return !i.inativo;
                        if (typeof i.is_active === 'boolean') return i.is_active;
                        return true; // default to true if no status flag is found
                    });

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
