import { prisma } from './prisma';

/**
 * Gets the primary tenant ID for a given tenant.
 * Useful to ensure we always write/read from the same record when duplicates exist.
 */
export async function getPrimaryTenantId(tenant: { id: string, name: string, cnpj: string | null }) {
    const cleanName = (tenant.name || '').trim().toUpperCase();
    const cleanCnpj = (tenant.cnpj || '').replace(/\D/g, '');

    const allVariants = await prisma.tenant.findMany({
        where: {
            OR: [
                { cnpj: cleanCnpj && cleanCnpj !== '' ? cleanCnpj : undefined },
                { name: { contains: cleanName, mode: 'insensitive' } }
            ]
        }
    });

    if (allVariants.length === 0) return tenant.id;
    
    // Pick the smallest ID alphabetically to be 100% deterministic
    return allVariants.map(v => v.id).sort()[0];
}

/**
 * Returns a list of all tenant IDs that are "variants" of the same company.
 */
export async function getAllVariantIds(tenantId: string) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) return [tenantId];

    const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
    const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const variants = await prisma.tenant.findMany({
        where: {
            OR: [
                (cleanCnpj && cleanCnpj !== '') ? { cnpj: cleanCnpj } : { name: t.name },
                { name: { contains: t.name } }
            ]
        },
        select: { id: true, name: true }
    });

    // Filter by normalized name to be sure
    return variants
        .filter(v => (v.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanName || v.id === tenantId)
        .map(v => v.id);
}
