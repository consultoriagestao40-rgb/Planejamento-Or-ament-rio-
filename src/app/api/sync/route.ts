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

        const { getAllVariantIds, getTenantGroups } = await import('@/lib/tenant-utils');
        let allVariantIds: string[] = [];

        const allTenantGroups = await getTenantGroups();
        const tenantToGroupKey = new Map<string, string>();
        allTenantGroups.forEach((group) => {
            group.forEach(tid => tenantToGroupKey.set(tid, group[0]));
        });

        if (tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            allVariantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
            const variantSets = await Promise.all(requestedIds.map(id => getAllVariantIds(id)));
            allVariantIds = Array.from(new Set(variantSets.flat()));
        }

        // --- NEW: Expand variants based on selected Cost Center's Tenant CNPJ ---
        if (costCenterId && costCenterId !== 'DEFAULT' && costCenterId !== 'null') {
            const firstCCId = costCenterId.split(',')[0].trim();
            const targetCC = await prisma.costCenter.findUnique({
                where: { id: firstCCId },
                include: { tenant: true }
            });
            if (targetCC?.tenant?.cnpj) {
                const sameCnpjTenants = await prisma.tenant.findMany({
                    where: { cnpj: targetCC.tenant.cnpj },
                    select: { id: true }
                });
                const extraIds = sameCnpjTenants.map(t => t.id);
                allVariantIds = Array.from(new Set([...allVariantIds, ...extraIds]));
            }
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
        } else if (costCenterId && costCenterId !== 'DEFAULT' && costCenterId !== 'null') {
                const requestedIds = costCenterId.split(',').map(id => id.trim()).filter(Boolean);
                const selectedCCs = await prisma.costCenter.findMany({
                    where: { id: { in: requestedIds } },
                    select: { name: true, tenantId: true }
                });
                
                const normalizeName = (name: string) => 
                    (name || '')
                        .toLowerCase()
                        .replace(/^[\d. ]+-?\s*/, '') // Remove leading codes like "271.225 - " or "271.225 "
                        .replace(/[^a-z0-9]/g, '')
                        .replace(/merces/g, 'meces') // Handle the specific typo Mercês vs Mecês
                        .trim();

                const allSynonymousIds = new Set<string>(requestedIds);
                if (selectedCCs.length > 0) {
                    const targetNorms = selectedCCs.map(cc => normalizeName(cc.name));
                    
                    // Search for synonyms in ALL variant tenants
                    const synonymousCCs = await prisma.costCenter.findMany({
                        where: {
                            tenantId: { in: allVariantIds }
                        },
                        select: { id: true, name: true }
                    });
                    
                    synonymousCCs.forEach(cc => {
                        const cn = normalizeName(cc.name);
                        if (targetNorms.some(tn => cn.includes(tn) || tn.includes(cn))) {
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

        // Deduplicate per tenant: sync- entries override manual ones within the same tenant+month
        const syncedMonthsPerTenant = new Set<string>();
        realizedRaw.forEach(e => {
            if (e.externalId && e.externalId.startsWith('sync-')) {
                syncedMonthsPerTenant.add(`${e.tenantId}|${e.year}|${e.month}`);
            }
        });

        const realizedEntriesRaw = realizedRaw.filter(e => {
            const key = `${e.tenantId}|${e.year}|${e.month}`;
            if (syncedMonthsPerTenant.has(key)) {
                return e.externalId && e.externalId.startsWith('sync-');
            }
            return true;
        });

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

        const requestedTenantIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
        const isConsolidated = tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT' || requestedTenantIds.length > 1;

        const getCleanCode = (name: string) => {
            const match = name.match(/^(\d{1,2}(?:\.\d+)*)/);
            return match ? match[1] : '';
        };

        const realizedEntries = realizedEntriesRaw.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const code = getCleanCode(catName);
            if (code === '06.1.2' || code === '06.2.2') return false;
            if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
            return true;
        });

        const budgetEntries = budgetRaw.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const code = getCleanCode(catName);
            if (code === '06.1.2' || code === '06.2.2') return false;
            if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
            return true;
        });


        const values: Record<string, number> = {};
        const seenGroupKeys = new Set<string>(); // groupKey||nameKey to prevent variant-tenant double-counting

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
                    const nameKeyPrefix = prefix === 'realized-' ? '' : 'budget-';
                    const nameKey = `${nameKeyPrefix}${normalizedName}|${e.month - 1}`;

                    // Only count each company group once per nameKey (prevents variant-tenant doubling)
                    const groupKey = tenantToGroupKey.get(e.tenantId) || e.tenantId;
                    const seenKey = `${groupKey}||${nameKey}`;
                    if (!seenGroupKeys.has(seenKey)) {
                        seenGroupKeys.add(seenKey);
                        values[nameKey] = (values[nameKey] || 0) + e.amount;

                        // Aggregator for Revenue
                        const isRevenue = normalizedName.startsWith('01');
                        if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                            const parentKey = `${nameKeyPrefix}01RECEITABRUTA|${e.month - 1}`;
                            values[parentKey] = (values[parentKey] || 0) + e.amount;
                        }
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
