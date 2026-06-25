import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get('categoryId');
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '2026', 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantIdParam = searchParams.get('tenantId') || 'ALL';

        if (!categoryId) {
            return NextResponse.json({ success: false, error: 'Category ID is required' }, { status: 400 });
        }

        // 1. Determine Target Tenants (Primary IDs) using unified tenant-utils
        const { getAllVariantIds } = await import('@/lib/tenant-utils');
        let targetTenantIds: string[] = [];
        
        if (tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            targetTenantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
            const variantSets = await Promise.all(requestedIds.map(id => getAllVariantIds(id)));
            targetTenantIds = Array.from(new Set(variantSets.flat()));
        }

        // 2. Determine Category IDs (Strict matching to Grid row, supporting prefixed and unprefixed variants)
        const allCategoryIds = new Set<string>();

        if (categoryId.startsWith('synth-')) {
            const codePrefix = categoryId.replace('synth-', '');
            // For synthetic parents, we DO need to find all children that match the code
            const children = await prisma.category.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    name: { startsWith: codePrefix }
                },
                select: { id: true }
            });
            children.forEach(c => allCategoryIds.add(c.id));
        } else {
            // For leaf/merged categories from the Grid, we expand the IDs to include all prefix combinations
            categoryId.split(',').map(id => id.trim()).filter(Boolean).forEach(id => {
                allCategoryIds.add(id);
                // Expand to include prefixed variant for each target tenant
                targetTenantIds.forEach(tId => {
                    allCategoryIds.add(`${tId}:${id}`);
                });
                // Expand to include unprefixed variant if id itself has a prefix
                if (id.includes(':')) {
                    allCategoryIds.add(id.split(':')[1]);
                }
            });
        }

        const costCenterIdParam = searchParams.get('costCenterId') || 'ALL';
        let targetCostCenterIds: string[] = [];

        if (costCenterIdParam !== 'ALL' && costCenterIdParam !== 'DEFAULT') {
            targetCostCenterIds = costCenterIdParam.split(',').map(id => id.trim()).filter(Boolean);
        }

        // 3. Query DB for transactions (using realizedEntry)
        const entriesRaw = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                categoryId: { in: Array.from(allCategoryIds) },
                month: month + 1, // 0-indexed from UI to 1-indexed in DB
                year,
                viewMode,
                ...(targetCostCenterIds.length > 0 ? { costCenterId: { in: targetCostCenterIds } } : {})
            },
            include: {
                category: true,
                tenant: true,
                costCenter: true
            }
        });

        // 4. Determine which tenants have synced data for this month/year/viewMode
        const syncedTenants = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                year,
                month: month + 1,
                viewMode,
                externalId: { startsWith: 'sync-' }
            },
            select: { tenantId: true },
            distinct: ['tenantId']
        });
        const syncedTenantIds = new Set(syncedTenants.map(t => t.tenantId));

        // Deduplicate entries: if a tenant is synced, only return entries with 'sync-' prefix
        const entriesSyncFiltered = entriesRaw.filter(e => {
            if (syncedTenantIds.has(e.tenantId)) {
                return e.externalId && (e.externalId.startsWith('sync-') || e.externalId.startsWith('adj-'));
            }
            return true;
        });

        const requestedTenantIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
        const isConsolidated = tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT' || requestedTenantIds.length > 1;

        const getCleanCode = (name: string) => {
            const match = name.match(/^(\d{1,2}(?:\.\d+)*)/);
            return match ? match[1] : '';
        };

        const entries = entriesSyncFiltered.filter(e => {
            const catName = e.category?.name || '';
            const code = getCleanCode(catName);
            if (code === '06.1.2' || code === '06.2.2') return false;
            if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
            return true;
        });

        const transactions = entries.map(e => ({
            id: e.id,
            externalId: e.externalId,
            date: e.date || `${year}-${String(month + 1).padStart(2, '0')}-01`,
            description: e.description || `Lançamento: ${e.category.name}`,
            value: e.amount,
            customer: e.customer || e.tenant.name,
            status: 'REALIZADO',
            tenantId: e.tenantId, // v66.25: ID for bulletproof reconciliation
            tenantName: e.tenant.name,
            categoryId: e.categoryId,
            costCenterId: e.costCenterId, // v66.25: ID for drill-down reconciliation
            costCenters: e.costCenter ? [{ nome: e.costCenter.name.replace(/^\[INATIVO\]\s*/i, '').replace(/^ENCERRADO\s*/i, '').trim() }] : []
        }));

        return NextResponse.json({
            success: true,
            transactions: transactions.sort((a, b) => b.value - a.value)
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
