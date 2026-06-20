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
            .flatMap(c => {
                const parts = c.id.split(':');
                const cleanId = parts.length > 1 ? parts[1] : c.id;
                return [c.id, cleanId];
            });

        if (revenueCategoryIds.length === 0) {
            return NextResponse.json({ success: true, contracts: [], totalBudget: 0, totalRealized: 0, totalAnnualRealized: 0, monthlyBudgets: {} });
        }

        // 4. Query DB for active period and annual faturamento
        const [realizedRaw, realizedAnnualRaw, budgetRaw] = await Promise.all([
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
            prisma.realizedEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    categoryId: { in: revenueCategoryIds },
                    year,
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

        // 5. Deduplicate realized data for active period
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

        // 5b. Deduplicate realized data for annual total
        const syncedAnnualMonths = new Set<string>();
        realizedAnnualRaw.forEach(e => {
            if (e.externalId && e.externalId.startsWith('sync-')) {
                syncedAnnualMonths.add(`${e.year}|${e.month}`);
            }
        });

        const realizedAnnualEntries = realizedAnnualRaw.filter(e => {
            const key = `${e.year}|${e.month}`;
            if (syncedAnnualMonths.has(key)) {
                return e.externalId && e.externalId.startsWith('sync-');
            }
            return true;
        });

        // 6. Aggregate values
        let totalBudget = budgetRaw.reduce((sum, b) => sum + b.amount, 0);
        let totalRealized = realizedEntries.reduce((sum, r) => sum + r.amount, 0);
        let totalAnnualRealized = realizedAnnualEntries.reduce((sum, r) => sum + r.amount, 0);

        const customerMap = new Map<string, { total: number; monthly: Record<number, number> }>();

        realizedEntries.forEach(r => {
            const customerName = normalizeCustomerName(r.customer || r.description || 'Sem Cliente/Outros');
            const monthIdx = r.month - 1; // 0-indexed month
            
            if (!customerMap.has(customerName)) {
                customerMap.set(customerName, { total: 0, monthly: {} });
            }
            
            const data = customerMap.get(customerName)!;
            data.total += r.amount;
            data.monthly[monthIdx] = (data.monthly[monthIdx] || 0) + r.amount;
        });

        // Calculate monthly budgets
        const monthlyBudgets: Record<number, number> = {};
        budgetRaw.forEach(b => {
            const m = b.month - 1;
            monthlyBudgets[m] = (monthlyBudgets[m] || 0) + b.amount / 1000;
        });

        // Convert to array and format
        const contracts = Array.from(customerMap.entries())
            .map(([name, data]) => {
                const totalInThousands = data.total / 1000;
                const percentageOfBudget = totalBudget > 0 ? (data.total / totalBudget) * 100 : 0;
                
                const monthlyInThousands: Record<number, number> = {};
                Object.entries(data.monthly).forEach(([m, val]) => {
                    monthlyInThousands[parseInt(m)] = val / 1000;
                });

                return {
                    name,
                    value: totalInThousands,
                    percentage: percentageOfBudget,
                    monthlyValues: monthlyInThousands
                };
            })
            .filter(c => c.value > 0) // Only return positive values
            .sort((a, b) => b.value - a.value); // Sort descending (largest at top)

        return NextResponse.json({
            success: true,
            contracts,
            totalBudget: totalBudget / 1000,
            totalRealized: totalRealized / 1000,
            totalAnnualRealized,
            monthlyBudgets
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
