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
        if (costCenterId === 'null') {
            whereClause.costCenterId = null;
        } else if (costCenterId !== 'DEFAULT') {
                // Find all IDs that share the same clean name as the selected costCenterIds
                const requestedIds = costCenterId.split(',').map(id => id.trim()).filter(Boolean);
                const selectedCCs = await prisma.costCenter.findMany({
                    where: { id: { in: requestedIds } },
                    select: { name: true, tenantId: true }
                });
                
                const normalizeName = (name: string) => 
                    (name || '')
                        .toLowerCase()
                        .replace(/^\[inativo\]\s*/i, '')
                        .replace(/^encerrado\s*/i, '')
                        .replace(/[^a-z0-9]/g, '')
                        .trim();

                const allSynonymousIds = new Set<string>(requestedIds);
                if (selectedCCs.length > 0) {
                    const targetNorms = selectedCCs.map(cc => normalizeName(cc.name));
                    const firstPartNames = selectedCCs.map(cc => (cc.name || '').split('-')[0].trim());
                    
                    const synonymousCCs = await prisma.costCenter.findMany({
                        where: {
                            tenantId: { in: selectedCCs.map(cc => cc.tenantId) },
                            OR: firstPartNames.map(name => ({
                                name: { contains: name }
                            }))
                        },
                        select: { id: true, name: true }
                    });
                    
                    synonymousCCs.forEach(cc => {
                        const cn = normalizeName(cc.name);
                        if (targetNorms.includes(cn)) {
                            allSynonymousIds.add(cc.id);
                        }
                    });
                }
                whereClause.costCenterId = { in: Array.from(allSynonymousIds) };
        }

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

        const realizedEntries = realizedRaw.filter(e => e.category !== null);
        const budgetEntries = budgetRaw.filter(e => e.category !== null);

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
