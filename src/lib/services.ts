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
    const accessToken = await getValidAccessToken();
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("Tenant not found");

    // Fetch in parallel for performance
    let syncError: string | null = null;
    const [categories, costCenters] = await Promise.all([
        fetchCategories(accessToken).catch(e => {
            console.error("Error fetching categories:", e);
            syncError = `Categories: ${e.message}`;
            return [];
        }),
        fetchCostCenters(accessToken).catch(e => {
            console.error("Error fetching cost centers:", e);
            return [];
        }),
    ]);

    if (syncError && categories.length === 0) {
        return {
            timestamp: new Date().toISOString(),
            error: syncError,
            categoriesCount: 0,
            costCentersCount: 0
        };
    }

    // Persist Cost Centers
    if (costCenters.length > 0) {
        for (const cc of costCenters) {
            await (prisma as any).costCenter.upsert({
                where: { id: cc.id },
                create: { id: cc.id, name: cc.name, tenantId: tenant.id },
                update: { name: cc.name }
            });
        }
    }

    // Persist Categories
    if (categories.length > 0) {
        for (const cat of categories) {
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
        }
    }

    return {
        timestamp: new Date().toISOString(),
        categoriesCount: categories.length,
        costCentersCount: costCenters.length,
        debug: {
            firstCategoryName: categories[0]?.name || 'none',
            rawCategoriesSample: JSON.stringify(categories).substring(0, 300),
            rawCostCentersSample: JSON.stringify(costCenters).substring(0, 300)
        }
    };
}

async function fetchCategories(accessToken: string) {
    const baseUrl = 'https://api-v2.contaazul.com';
    console.log("Fetching categories from V2 API...");
    const res = await fetch(`${baseUrl}/v1/categorias`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 404) {
        console.warn("Categories /v1/categorias not found on V2, trying /v1/categories...");
        const res2 = await fetch(`${baseUrl}/v1/categories`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!res2.ok) throw new Error(`V2 Categories API failed (404 on both): ${res2.status}`);
        const data = await res2.json();
        return Array.isArray(data) ? data : (data.items || data.categorias || []);
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`V2 Categories API failed: ${res.status} ${text.substring(0, 100)}`);
    }
    const data = await res.json();
    // V20.1: Defensive handling of response format
    const categories = Array.isArray(data) ? data : (data.items || data.categorias || []);
    console.log(`Found ${categories.length} categories. First one:`, categories[0] ? JSON.stringify(categories[0]) : 'none');
    return categories;
}

async function fetchCostCenters(accessToken: string) {
    const baseUrl = 'https://api-v2.contaazul.com';
    console.log("Fetching cost centers from V2 API...");
    const res = await fetch(`${baseUrl}/v1/centro-de-custo`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 404) {
        const res2 = await fetch(`${baseUrl}/v1/cost-centers`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!res2.ok) return [];
        const data = await res2.json();
        return Array.isArray(data) ? data : (data.items || data.cost_centers || []);
    }

    if (!res.ok) return [];
    const data = await res.json();
    const centers = Array.isArray(data) ? data : (data.items || data.cost_centers || []);
    console.log(`Found ${centers.length} cost centers.`);
    return centers;
}

// Removing fetchSales as the focus is on DRE structure (Categories/Cost Centers) for now
// and sales might require a different sync logic into BudgetEntry.
