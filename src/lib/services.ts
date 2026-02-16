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
    const [categories, costCenters] = await Promise.all([
        fetchCategories(accessToken).catch(e => { console.error("Error fetching categories:", e); return []; }),
        fetchCostCenters(accessToken).catch(e => { console.error("Error fetching cost centers:", e); return []; }),
    ]);

    // Persist Cost Centers
    if (costCenters.length > 0) {
        for (const cc of costCenters) {
            await prisma.costCenter.upsert({
                where: { id: cc.id },
                create: { id: cc.id, name: cc.name, tenantId: tenant.id },
                update: { name: cc.name }
            });
        }
    }

    // Persist Categories (Using simple loop to avoid complex recursion for now, assuming flat or parent info included)
    if (categories.length > 0) {
        for (const cat of categories) {
            await prisma.category.upsert({
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
    };
}

async function fetchCategories(accessToken: string) {
    // API de Financeiro V1 - Categorias
    const res = await fetch('https://api.contaazul.com/v1/categorias', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch categories: ${res.statusText}`);
    }
    return res.json();
}

async function fetchCostCenters(accessToken: string) {
    // API de Financeiro V1 - Centros de Custo
    const res = await fetch('https://api.contaazul.com/v1/centro-de-custo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch cost centers: ${res.statusText}`);
    }
    return res.json();
}

// Removing fetchSales as the focus is on DRE structure (Categories/Cost Centers) for now
// and sales might require a different sync logic into BudgetEntry.
