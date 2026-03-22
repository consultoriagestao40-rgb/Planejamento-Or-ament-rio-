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

        // Apply cost center filter
        // DEFAULT means show everything (no CC filter)
        // null means show only unallocated (Geral)
        if (costCenterId === 'null') {
            whereClause.costCenterId = null;
        } else if (costCenterId !== 'DEFAULT') {
            const ids = costCenterId.split(',').map(id => id.trim()).filter(Boolean);
            if (ids.length > 0) {
                whereClause.costCenterId = { in: ids };
            }
        }

        const [realizedEntries, budgetEntries] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: { ...whereClause, viewMode }
            }),
            prisma.budgetEntry.findMany({
                where: whereClause
            })
        ]);

        const categories = await prisma.category.findMany({
            where: { tenantId: { in: allVariantIds } },
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
                // 1. ID-based key for BudgetEntryGrid (unprefixed ID or 'realized-' prefixed ID)
                const idKey = prefix ? `${prefix}${e.categoryId}-${e.month - 1}` : `${e.categoryId}-${e.month - 1}`;
                values[idKey] = (values[idKey] || 0) + e.amount;

                // 2. Name-based key for Dashboard (DRE)
                let catName = categoryNameMap.get(e.categoryId);
                if (!catName && e.categoryId.includes(':')) {
                    catName = categoryNameMap.get(e.categoryId.split(':')[1]);
                }

                if (catName) {
                    const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    // IMPORTANT: The Dashboard expects plain name keys for Realized data.
                    // For Budget data, we use 'budget-' prefix to avoid collision.
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
        aggregate(budgetEntries, ''); // Budget uses prefix='' but then nameKeyPrefix='budget-'

        return NextResponse.json({
            success: true,
            realizedValues: values,
            variantIdsUsed: allVariantIds
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
