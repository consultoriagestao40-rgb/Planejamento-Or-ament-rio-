import { prisma } from '@/lib/prisma';
import { refreshAccessToken } from './contaazul';
import { ensureTenantSchema } from './db-utils';

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
    await ensureTenantSchema();
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
    const tenantsToSync = [];
    
    if (tenantId && tenantId !== 'ALL') {
        const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (t) tenantsToSync.push(t);
    } else {
        const allTenants = await prisma.tenant.findMany();
        tenantsToSync.push(...allTenants);
    }

    if (tenantsToSync.length === 0) {
        return { success: false, error: "No tenants found to sync", timestamp: new Date().toISOString() };
    }

    const globalReport = {
        success: true,
        tenantsSynced: 0,
        totalCategoriesSuccess: 0,
        totalCostCentersSuccess: 0,
        errors: [] as string[]
    };

    for (const tenant of tenantsToSync) {
        try {
            console.log(`Starting sync for tenant: ${tenant.name} (${tenant.id})`);
            
            // Get valid token for this specific tenant
            const { token: accessToken } = await getValidAccessToken(tenant.id);

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
                rawApiError: (globalThis as any).lastApiError || 'none recorded'
            };


    // Persist Cost Centers with individual try/catch
    const costCenterIdsToKeep: string[] = [];
    for (const cc of costCenters) {
        try {
            const ccId = `${tenant.id}:${cc.id}`; // ID Único por empresa
            const ccName = cc.nome || cc.name;
            if (!cc.id || !ccName) continue;

            await (prisma as any).costCenter.upsert({
                where: { id: ccId },
                create: { id: ccId, name: ccName, tenantId: tenant.id },
                update: { 
                    name: ccName.startsWith('[INATIVO]') ? ccName : ccName 
                }
            });
            costCenterIdsToKeep.push(ccId);
            report.costCentersSuccess++;
        } catch (e: any) {
            report.costCentersFailed++;
            report.lastError = `CC Upsert Error (${cc.id}): ${e.message}`;
        }
    }

    // Mark Cost Centers as Inactive by renaming them
    // SAFETY: Only do this if the fetch was successful to avoid marking everything as inactive during an API outage
    if (!fetchError && costCenters.length > 0) {
        try {
            const inactives = await prisma.costCenter.findMany({
                where: {
                    tenantId: tenant.id,
                    id: { notIn: costCenterIdsToKeep },
                    NOT: { 
                        OR: [
                            { name: { contains: '[INATIVO]' } },
                            { name: { contains: 'ENCERRADO', mode: 'insensitive' } }
                        ]
                    }
                }
            });

            for (const cc of inactives) {
                await prisma.costCenter.update({
                    where: { id: cc.id },
                    data: { name: `[INATIVO] ${cc.name}` }
                });
            }
        } catch (e: any) {
            console.warn("Falha ao inativar CCs por nome:", e.message);
        }
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
            entradaDreLocal: null, 
            parentIdLocal: cat.categoria_pai?.id ? `${tenant.id}:${cat.categoria_pai.id}` : (cat.parent_id ? `${tenant.id}:${cat.parent_id}` : null) // Parent ID também deve ser composto
        };
    });

    // Persist Categories
    for (const cat of mappedCategories) {
        try {
            const catId = `${tenant.id}:${cat.id}`;
            const typeValue = cat.tipo || cat.type || 'EXPENSE';
            const catName = cat.name || '';
            const catNameLower = catName.toLowerCase();

            // Busca categoria existente para NÃO sobrescrever entradaDre se o novo for null
            const existingCat = await (prisma as any).category.findUnique({ where: { id: catId } });

            // Self-Healing: Classificação automática baseada no nome se entradaDre estiver vazio
            let autoEntradaDre = cat.entradaDreLocal || existingCat?.entradaDre || null;
            if (!autoEntradaDre) {
                if (catNameLower.includes('venda') || catNameLower.includes('faturamento') || catName?.startsWith('01') || catName?.startsWith('1.')) {
                    autoEntradaDre = '01. RECEITA BRUTA';
                } else if (catNameLower.includes('tributo') || catNameLower.includes('imposto') || catName?.startsWith('02')) {
                    autoEntradaDre = '02. TRIBUTO SOBRE FATURAMENTO';
                }
            }

            await (prisma as any).category.upsert({
                where: { id: catId },
                create: {
                    id: catId,
                    name: cat.name,
                    tenantId: tenant.id,
                    parentId: cat.parentIdLocal,
                    type: typeValue,
                    entradaDre: autoEntradaDre
                },
                update: {
                    name: cat.name,
                    parentId: cat.parentIdLocal,
                    type: typeValue,
                    entradaDre: autoEntradaDre
                }
            });
            report.categoriesSuccess++;
        } catch (e: any) {
            report.categoriesFailed++;
            report.lastError = `Cat Upsert Error (${cat.id}): ${e.message}`;
        }
    }



            globalReport.tenantsSynced++;
            globalReport.totalCategoriesSuccess += report.categoriesSuccess;
            globalReport.totalCostCentersSuccess += report.costCentersSuccess;
        } catch (e: any) {
            console.error(`Sync failed for tenant ${tenant.name}:`, e);
            globalReport.errors.push(`${tenant.name}: ${e.message}`);
        }
    }

    return {
        ...globalReport,
        timestamp: new Date().toISOString()
    };
}


// V46: Aggregates transactions for DRE (Competence View - V47.9.5)
export async function fetchRealizedValues(accessToken: string, targetYear: number, costCenterId: string, viewMode: 'caixa' | 'competencia' = 'competencia', tenantId: string): Promise<Record<string, number>> {
    const values: Record<string, number> = {};

    const isCaixa = viewMode === 'caixa';
    const startStr = isCaixa ? `${targetYear}-01-01` : `${targetYear - 1}-07-01`;
    const endStr = isCaixa ? `${targetYear}-12-31` : `${targetYear + 1}-06-30`;
    const dateParam = isCaixa ? 'data_pagamento' : 'data_vencimento';
    
    // 1. Fetch Receivables
    await aggregateTransactions(
        accessToken,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        values,
        false,
        costCenterId,
        targetYear,
        viewMode,
        tenantId
    );

    // 2. Fetch Payables
    await aggregateTransactions(
        accessToken,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        values,
        true, // isExpense
        costCenterId,
        targetYear,
        viewMode,
        tenantId
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
    viewMode: 'caixa' | 'competencia' = 'competencia',
    tenantId: string = 'UNKNOWN'
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

    // Wait, let's remove the ItemBucket variables completely to avoid unused warnings
    const singleCCByKey: Record<string, number> = {};
    const multiCCByKey: Record<string, any[]> = {}; // Keeping them here to prevent TS errors if anything else calls it. But they are empty now.

    while (hasMore && page <= 200) {
        const url = `${finalUrlBase}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) { hasMore = false; break; }

            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) { hasMore = false; break; }

            for (const item of items) {
                let amount: number;
                let dateStr: string;

                if (viewMode === 'caixa') {
                    // Regime de Caixa: Priorizar data de pagamento real
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    
                    // Apenas considerar se estiver pago (BAIXADO ou valor pago > 0)
                    const isPaid = (item.status || '').toUpperCase() === 'BAIXADO' || (item.pago && item.pago > 0);
                    if (!isPaid) continue;

                    amount = item.pago || item.total || item.valor || 0;
                } else {
                    // Regime de Competência: Priorizar data de competência
                    amount = item.total || item.valor_original || item.valor || 0;
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                }

                let dateObj = dateStr ? new Date(dateStr) : new Date();
                const monthIdx = dateObj.getMonth();
                const year = dateObj.getFullYear();
                if (year !== targetYear) continue;

                const status = (item.status || '').toUpperCase();
                if (status.includes('CANCEL')) continue;

                let ccs = item.centros_de_custo || [];

                if (ccs.length > 1) {
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                const rateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.rateio_centro_custo && r.valor) {
                                        r.rateio_centro_custo.forEach((rc: any) => {
                                            // The rateio JSON provides absolute values for the entire event.
                                            // We calculate the percentage and apply it to THIS individual installment!
                                            const percent = (rc.valor || 0) / r.valor;
                                            const proportionalValue = amount * percent;
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + proportionalValue);
                                        });
                                    }
                                });
                                ccs = ccs.map((cc: any) => ({
                                    ...cc,
                                    valor: rateioMap.has(cc.id) ? rateioMap.get(cc.id) : cc.valor
                                }));
                            }
                        }
                    } catch(e) {}
                }

                // If filtered, the item MUST belong to AT LEAST ONE of the target CCs
                if (isFiltered) {
                    const matchesTarget = ccs.some((c: any) => targetCcs.includes(c.id));
                    if (!matchesTarget) continue;
                }

                const categories = item.categorias || [];
                if (categories.length > 0) {
                    // Propriedade correta na API V2 é parent_id
                    const leafCats = categories.filter((c: any) => !categories.some((other: any) => other.parent_id === c.id));
                    const finalCats = leafCats.length > 0 ? leafCats : [categories[0]];

                    // 1-PASS RATEIO FOR REMAINDERS:
                    let totalAllocated = 0;
                    let unallocatedCount = 0;

                    const processedCcs = ccs.map((cc: any) => {
                        let explicitAmount = null;
                        if (typeof cc.valor === 'number') {
                            explicitAmount = Math.abs(cc.valor);
                        } else if (typeof cc.percentual === 'number') {
                            explicitAmount = amount * (cc.percentual / 100);
                        }

                        if (explicitAmount !== null) {
                            totalAllocated += explicitAmount;
                        } else {
                            unallocatedCount++;
                        }
                        return { ...cc, explicitAmount };
                    });

                    const remainingAmount = Math.max(0, amount - totalAllocated);
                    const fallbackPerCc = unallocatedCount > 0 ? (remainingAmount / unallocatedCount) : (amount / (ccs.length || 1));

                    for (const cat of finalCats) {
                        const catId = `${tenantId}:${cat.id}`;
                        const catValue = typeof cat.valor === 'number' ? Math.abs(cat.valor) : (amount / finalCats.length);

                        const key = `${catId}-${monthIdx}`;
                        
                        if (isMultiSelect) {
                            // Sum allocated values for the target CCs
                            let sumMatchingCCs = 0;
                            processedCcs.forEach((c: any) => {
                                const compositeCcId = `${tenantId}:${c.id}`;
                                if (targetCcs.includes(compositeCcId) || targetCcs.includes(c.id)) {
                                    sumMatchingCCs += c.explicitAmount !== null ? c.explicitAmount : fallbackPerCc;
                                }
                            });
                            // If calculating percentage-based catValue, we should probably scale sumMatchingCCs
                            // but usually CA doesn't split categories and CCs orthogonally in complex ways that we need to perfectly replicate here if it's already divided.
                            targetValues[key] = (targetValues[key] || 0) + (sumMatchingCCs * (catValue / amount));
                        } else {
                            if (!isFiltered || ccs.length === 1) {
                                targetValues[key] = (targetValues[key] || 0) + catValue;
                            } else {
                                let specificAmount = 0;
                                const targetC = processedCcs.find((c: any) => {
                                    const compositeCcId = `${tenantId}:${c.id}`;
                                    return targetCcs.includes(compositeCcId) || targetCcs.includes(c.id);
                                });
                                
                                if (targetC) {
                                    specificAmount = targetC.explicitAmount !== null ? targetC.explicitAmount : fallbackPerCc;
                                } else {
                                    specificAmount = fallbackPerCc; 
                                }
                                targetValues[key] = (targetValues[key] || 0) + (specificAmount * (catValue / amount));
                            }
                        }
                    }
                }
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e: any) {
            hasMore = false;
        }
    }

    // Remove old `singleCCByKey` and `multiCCByKey` processing block
    // because we are now calculating the exact value dynamically above 
    // using Conta Azul's `valor` and `percentual` fields during the loop.
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
                (globalThis as any).lastApiError = `Categories Page ${page} failed: ${res.status}`;
            }
        } catch (e: any) {
            hasMore = false;
            console.warn(`Error on categories page ${page}:`, e.message);
        }
    }

    if (allItems.length > 0) {
        (globalThis as any).lastCategoriesRaw = JSON.stringify(allItems).substring(0, 1000);
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
                        (globalThis as any).lastApiError = `DEBUG CC[0]: ${JSON.stringify(items[0]).substring(0, 500)}`;
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
        (globalThis as any).lastCostCentersRaw = JSON.stringify(allItems).substring(0, 1000);
    }
    return allItems;
}

// Removing fetchSales as the focus is on DRE structure (Categories/Cost Centers) for now
// and sales might require a different sync logic into BudgetEntry.
