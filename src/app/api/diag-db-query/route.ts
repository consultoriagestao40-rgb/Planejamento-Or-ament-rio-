import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantIdParam = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const costCenterId = 'DEFAULT';
        const year = 2026;
        const viewMode = 'competencia';

        const { getAllVariantIds } = await import('@/lib/tenant-utils');
        let allVariantIds: string[] = [];

        if (tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            allVariantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
            const variantSets = await Promise.all(requestedIds.map(id => getAllVariantIds(id)));
            allVariantIds = Array.from(new Set(variantSets.flat()));
        }

        // Deduplicate
        allVariantIds = Array.from(new Set(allVariantIds));

        const whereClause: any = {
            tenantId: { in: allVariantIds },
            year
        };

        const [realizedRaw, budgetRaw] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: { ...whereClause, viewMode },
                include: { category: true }
            }),
            prisma.budgetEntry.findMany({
                where: whereClause,
                include: { category: true }
            })
        ]);

        const realizedEntries = realizedRaw;
        const budgetEntries = budgetRaw;

        const categories = await prisma.category.findMany({
            select: { id: true, name: true }
        });

        const categoryNameMap = new Map<string, string>();
        categories.forEach(c => {
            categoryNameMap.set(c.id, c.name);
            if (c.id.includes(':')) {
                const code = c.id.split(':')[1];
                if (!categoryNameMap.has(code)) {
                    categoryNameMap.set(code, c.name);
                }
            }
        });

        const values: Record<string, number> = {};
        
        // Helper to aggregate entries (Realized or Budget)
        const aggregate = (entries: any[], prefix: string = '') => {
            entries.forEach((e: any) => {
                // 1. ID-based key
                const idKey = prefix ? `${prefix}${e.categoryId}-${e.month - 1}` : `${e.categoryId}-${e.month - 1}`;
                values[idKey] = (values[idKey] || 0) + e.amount;

                // 2. Name-based key
                let catName = categoryNameMap.get(e.categoryId);
                if (!catName && e.categoryId.includes(':')) {
                    catName = categoryNameMap.get(e.categoryId.split(':')[1]);
                }

                if (catName) {
                    const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const nameKeyPrefix = prefix === 'realized-' ? '' : 'budget-';
                    const nameKey = `${nameKeyPrefix}${normalizedName}|${e.month - 1}`;
                    
                    values[nameKey] = (values[nameKey] || 0) + e.amount;
                    
                    // Aggregator for Revenue
                    const isRevenue = normalizedName.startsWith('01');
                    if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                        const parentKey = `${nameKeyPrefix}01RECEITABRUTA|${e.month - 1}`;
                        values[parentKey] = (values[parentKey] || 0) + e.amount;
                    }
                }
            });
        };

        aggregate(realizedEntries, 'realized-');
        aggregate(budgetEntries, '');

        return NextResponse.json({
            success: true,
            variantIdsUsed: allVariantIds,
            whereClause,
            realizedCount: realizedRaw.length,
            // Return only keys relevant for month May (monthIndex 4)
            mayKeys: Object.fromEntries(
                Object.entries(values).filter(([k]) => k.endsWith('|4') || k.endsWith('-4'))
            )
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}


