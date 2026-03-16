import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantIdParam = searchParams.get('tenantId') || 'ALL';

        const allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
        
        // Deduplicate and pick Primary IDs for each company group
        const companyGroups = new Map<string, string[]>(); // key -> list of variant IDs
        allTenants.forEach((t: any) => {
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
            if (!companyGroups.has(key)) companyGroups.set(key, []);
            companyGroups.get(key)!.push(t.id);
        });

        const primaryTenantIds: string[] = Array.from(companyGroups.values()).map(ids => {
            // Must match cronSync logic: Deterministic selection (alphabetical lowest ID)
            return ids.sort()[0];
        });

        let targetTenantIds: string[] = [];
        if (tenantIdParam === 'ALL') {
             targetTenantIds = primaryTenantIds;
        } else {
            const inputIds = tenantIdParam.split(',').map(t => t.trim()).filter(Boolean);
            for (const id of inputIds) {
                const t = allTenants.find((ten: any) => ten.id === id);
                if (t) {
                    const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
                    const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
                    const group = companyGroups.get(key) || [id];
                    const primary = group.sort()[0];
                    if (!targetTenantIds.includes(primary)) targetTenantIds.push(primary);
                }
            }
        }

        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                year,
                viewMode
            }
        });

        const allVariantIds: string[] = [];
        for (const pid of targetTenantIds) {
            const t = allTenants.find((ten: any) => ten.id === pid);
            if (t) {
                const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
                const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
                const group = companyGroups.get(key) || [pid];
                allVariantIds.push(...group);
            }
        }

        const categories = await prisma.category.findMany({
            where: { tenantId: { in: allVariantIds } },
            select: { id: true, name: true }
        });

        const categoryMap = new Map<string, string>();
        categories.forEach((c: any) => {
            // Map both original ID and the clean version to name for aggregate sum
            categoryMap.set(c.id, c.name);
            if (c.id.includes(':')) {
                categoryMap.set(c.id.split(':')[1], c.name);
            }
        });

        const realizedValues: Record<string, number> = {};
        entries.forEach((e: any) => {
            const catName = categoryMap.get(e.categoryId);
            if (catName) {
                const key = `${catName}|${e.month - 1}`;
                realizedValues[key] = (realizedValues[key] || 0) + e.amount;
            }
        });

        return NextResponse.json({
            success: true,
            realizedValues,
            variantIdsUsed: targetTenantIds
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
