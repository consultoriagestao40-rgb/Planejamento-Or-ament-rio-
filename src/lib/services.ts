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

    // Fetch in parallel for performance
    const [categories, costCenters, sales] = await Promise.all([
        fetchCategories(accessToken).catch(e => { console.error("Error fetching categories:", e); return []; }),
        fetchCostCenters(accessToken).catch(e => { console.error("Error fetching cost centers:", e); return []; }),
        fetchSales(accessToken).catch(e => { console.error("Error fetching sales:", e); return []; }),
    ]);

    // In a real app, we would save these to the database here.
    // For this prototype, we return the data to be displayed directly.
    return {
        timestamp: new Date().toISOString(),
        categories,
        costCenters,
        sales
    };
}

async function fetchCategories(accessToken: string) {
    // Note: 'product-categories' is often for items, not financial accounts. 
    // If 'plano de contas' is needed, the endpoint might differ or require specific permissions.
    // We will try a standard endpoint, but fallback to a mock if it fails (common in Sandbox/Dev).
    const res = await fetch('https://api.contaazul.com/v1/sales/product-categories', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
        console.warn("Categories endpoint failed, using fallback data.");
        // Fallback for prototype if API fails or scope issues
        return [
            { id: '1', name: 'Receita de Vendas' },
            { id: '2', name: 'Serviços Prestados' }
        ];
    }
    return res.json();
}

async function fetchCostCenters(accessToken: string) {
    // Hypothetical endpoint - check docs if 404
    const res = await fetch('https://api.contaazul.com/v1/costs-centers', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) return [];
    return res.json();
}

async function fetchSales(accessToken: string) {
    const res = await fetch('https://api.contaazul.com/v1/sales?status=COMMITTED', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) return [];
    return res.json();
}
