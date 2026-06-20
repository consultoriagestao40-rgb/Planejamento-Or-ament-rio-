import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAllVariantIds } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

function normalizeCustomerName(name: string): string {
    return (name || 'Sem Cliente/Outros')
        .replace(/^\[INATIVO\]\s*/i, '')
        .replace(/^ENCERRADO\s*/i, '')
        .trim();
}

const isRevenueCategory = (name: string) => {
    const cleanCode = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
    return cleanCode.startsWith('01') || cleanCode === '1';
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantIdParam = searchParams.get('tenantId') || 'ALL';
        const costCenterIdParam = searchParams.get('costCenterId') || 'ALL';
        const year = parseInt(searchParams.get('year') || '2026', 10);
        const startMonth = parseInt(searchParams.get('startMonth') || '0', 10);
        const endMonth = parseInt(searchParams.get('endMonth') || '11', 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';

        // 1. Resolve tenants
        let targetTenantIds: string[] = [];
        if (tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            targetTenantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
            const variantSets = await Promise.all(requestedIds.map(id => getAllVariantIds(id)));
            targetTenantIds = Array.from(new Set(variantSets.flat()));
        }

        // 2. Resolve cost centers
        let targetCostCenterIds: string[] = [];
        if (costCenterIdParam !== 'ALL' && costCenterIdParam !== 'DEFAULT') {
            targetCostCenterIds = costCenterIdParam.split(',').map(id => id.trim()).filter(Boolean);
        }

        // 3. Resolve revenue category IDs
        const categories = await prisma.category.findMany({
            where: { tenantId: { in: targetTenantIds } },
            select: { id: true, name: true }
        });
        const revenueCategoryIds = categories
            .filter(c => isRevenueCategory(c.name))
            .map(c => c.id);

        if (revenueCategoryIds.length === 0) {
            return NextResponse.json({ success: true, contracts: [], totalBudget: 0, totalRealized: 0 });
        }

        // 4. Query DB
        const [realizedRaw, budgetRaw] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    categoryId: { in: revenueCategoryIds },
                    year,
                    month: { gte: startMonth + 1, lte: endMonth + 1 },
                    viewMode,
                    ...(targetCostCenterIds.length > 0 ? { costCenterId: { in: targetCostCenterIds } } : {})
                }
            }),
            prisma.budgetEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    categoryId: { in: revenueCategoryIds },
                    year,
                    month: { gte: startMonth + 1, lte: endMonth + 1 },
                    ...(targetCostCenterIds.length > 0 ? { costCenterId: { in: targetCostCenterIds } } : {})
                }
            })
        ]);

        // 5. Deduplicate realized data matching dashboard sync logic
        const syncedMonths = new Set<string>();
        realizedRaw.forEach(e => {
            if (e.externalId && e.externalId.startsWith('sync-')) {
                syncedMonths.add(`${e.year}|${e.month}`);
            }
        });

        const realizedEntries = realizedRaw.filter(e => {
            const key = `${e.year}|${e.month}`;
            if (syncedMonths.has(key)) {
                return e.externalId && e.externalId.startsWith('sync-');
            }
            return true;
        });

        // 6. Aggregate values
        let totalBudget = budgetRaw.reduce((sum, b) => sum + b.amount, 0);
        let totalRealized = realizedEntries.reduce((sum, r) => sum + r.amount, 0);

        const customerMap = new Map<string, number>();

        realizedEntries.forEach(r => {
            const customerName = normalizeCustomerName(r.customer || r.description || 'Sem Cliente/Outros');
            customerMap.set(customerName, (customerMap.get(customerName) || 0) + r.amount);
        });

        // Convert to array and format
        const contracts = Array.from(customerMap.entries())
            .map(([name, value]) => {
                const valueInThousands = value / 1000;
                const percentageOfBudget = totalBudget > 0 ? (value / totalBudget) * 100 : 0;
                return {
                    name,
                    value: valueInThousands,
                    percentage: percentageOfBudget
                };
            })
            .filter(c => c.value > 0) // Only return positive values
            .sort((a, b) => b.value - a.value); // Sort descending (largest at top)

        return NextResponse.json({
            success: true,
            contracts,
            totalBudget: totalBudget / 1000,
            totalRealized: totalRealized / 1000
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
