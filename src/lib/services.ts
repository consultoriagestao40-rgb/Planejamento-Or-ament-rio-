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

    console.log("Starting syncData V30...");
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
        lastError: fetchError
    };

    // Persist Cost Centers with individual try/catch
    for (const cc of costCenters) {
        try {
            if (!cc.id || !cc.name) continue;
            await (prisma as any).costCenter.upsert({
                where: { id: cc.id },
                create: { id: cc.id, name: cc.name, tenantId: tenant.id },
                update: { name: cc.name }
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
            if (!cat.id || !cat.name) continue;
            await (prisma as any).category.upsert({
                where: { id: cat.id },
                create: {
                    id: cat.id,
                    name: cat.name,
                    tenantId: tenant.id,
                    parentId: cat.parent_id || null,
                    type: cat.type || 'EXPENSE'
                },
                update: {
                    name: cat.name,
                    parentId: cat.parent_id || null,
                    type: cat.type || 'EXPENSE'
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
    try {
        const payload = accessToken.split('.')[1];
        if (payload) {
            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
            grantedScopes = decoded.scope || decoded.authorities || 'none found in JWT';
        }
    } catch (e) {
        grantedScopes = 'not a JWT or decode failed';
    }

    return {
        success: true,
        timestamp: new Date().toISOString(),
        categoriesCount: categories.length,
        costCentersCount: costCenters.length,
        report,
        debug: {
            grantedScopes,
            firstCategory: categories[0] ? JSON.stringify(categories[0]) : 'none',
            rawCategoriesSample: JSON.stringify(categories).substring(0, 500)
        }
    };
}

async function fetchCategories(accessToken: string) {
    const urls = [
        'https://api-v2.contaazul.com/v1/categorias',
        'https://api.contaazul.com/v1/categorias',
        'https://api-v2.contaazul.com/v1/categories',
        'https://api.contaazul.com/v1/categories'
    ];

    for (const url of urls) {
        try {
            console.log(`Trying categories from: ${url}`);
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                const data = await res.json();
                const items = Array.isArray(data) ? data : (data.items || data.categorias || []);
                if (items.length > 0) return items;
            } else {
                console.warn(`Categories failed (${url}): Status ${res.status}`);
            }
        } catch (e) {
            console.warn(`Error on ${url}:`, e);
        }
    }
    return [];
}

async function fetchCostCenters(accessToken: string) {
    const urls = [
        'https://api-v2.contaazul.com/v1/centro-de-custo',
        'https://api.contaazul.com/v1/centro-de-custo',
        'https://api-v2.contaazul.com/v1/cost-centers'
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                const data = await res.json();
                const items = Array.isArray(data) ? data : (data.items || data.cost_centers || []);
                if (items.length > 0) return items;
            } else {
                console.warn(`CostCenters failed (${url}): Status ${res.status}`);
            }
        } catch (e) { }
    }
    return [];
}

// Removing fetchSales as the focus is on DRE structure (Categories/Cost Centers) for now
// and sales might require a different sync logic into BudgetEntry.
