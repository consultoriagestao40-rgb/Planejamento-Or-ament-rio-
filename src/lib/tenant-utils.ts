import { prisma } from './prisma';

/**
 * Normalizes a tenant name for grouping purposes.
 */
export function normalizeTenantName(name: string): string {
    return (name || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/LTDA$/, '')
        .replace(/SA$/, '');
}

/**
 * Gets all tenant groups based on CNPJ or normalized name.
 */
export async function getTenantGroups(): Promise<string[][]> {
    const allTenants = await prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true } });
    const groups = new Map<string, string[]>();

    allTenants.forEach(t => {
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const cleanName = normalizeTenantName(t.name);
        
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t.id);
    });

    return Array.from(groups.values()).map(ids => ids.sort());
}

/**
 * Gets the primary tenant ID for a given tenant ID.
 */
export async function getPrimaryTenantId(tenant: { id: string, name?: string, cnpj?: string | null } | string) {
    const id = typeof tenant === 'string' ? tenant : tenant.id;
    const groups = await getTenantGroups();
    const group = groups.find(g => g.includes(id));
    return group ? group[0] : id;
}

/**
 * Returns a list of all tenant IDs that are "variants" of the same company.
 */
export async function getAllVariantIds(tenantId: string) {
    const groups = await getTenantGroups();
    const group = groups.find(g => g.includes(tenantId));
    return group || [tenantId];
}
