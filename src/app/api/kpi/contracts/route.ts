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

const getCategoryType = (name: string): 'rev' | 'tax' | 'cost' | 'opExp' | 'other' => {
    const cleanCode = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
    if (cleanCode.startsWith('01') || cleanCode.startsWith('1')) return 'rev';
    if (cleanCode.startsWith('02') || cleanCode.startsWith('2')) return 'tax';
    if (cleanCode.startsWith('3') || cleanCode.startsWith('03')) return 'cost';
    if (cleanCode.startsWith('4') || cleanCode.startsWith('04')) return 'opExp';
    return 'other';
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

        // 3. Resolve category IDs and their DRE types
        const categories = await prisma.category.findMany({
            where: { tenantId: { in: targetTenantIds } },
            select: { id: true, name: true }
        });

        const categoryTypeMap = new Map<string, 'rev' | 'tax' | 'cost' | 'opExp'>();
        categories.forEach(c => {
            const parts = c.id.split(':');
            const cleanId = parts.length > 1 ? parts[1] : c.id;
            const type = getCategoryType(c.name);
            if (type !== 'other') {
                categoryTypeMap.set(c.id, type);
                categoryTypeMap.set(cleanId, type);
            }
        });

        const targetCategoryIds = Array.from(categoryTypeMap.keys());

        if (targetCategoryIds.length === 0) {
            return NextResponse.json({ 
                success: true, 
                contracts: [], 
                contractsMargin: [],
                totalBudget: 0, 
                totalRealized: 0, 
                totalAnnualRealized: 0, 
                monthlyBudgets: {} 
            });
        }

        // Resolve revenue-only category IDs for legacy contract faturamento
        const revenueCategoryIds = Array.from(categoryTypeMap.entries())
            .filter(([_, type]) => type === 'rev')
            .map(([id]) => id);

        // 4. Query DB for active period and annual data
        const [realizedRaw, realizedAnnualRaw, budgetRaw, costCenters] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    categoryId: { in: targetCategoryIds },
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
                    categoryId: { in: targetCategoryIds },
                    year,
                    month: { gte: startMonth + 1, lte: endMonth + 1 },
                    ...(targetCostCenterIds.length > 0 ? { costCenterId: { in: targetCostCenterIds } } : {})
                }
            }),
            prisma.costCenter.findMany({
                where: { tenantId: { in: targetTenantIds } }
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

        // 5b. Deduplicate realized data for annual faturamento
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

        // 6. Aggregate faturamento por contrato (Clientes)
        const revenueRealizedEntries = realizedEntries.filter(r => categoryTypeMap.get(r.categoryId) === 'rev');
        const revenueBudgetEntries = budgetRaw.filter(b => categoryTypeMap.get(b.categoryId) === 'rev');

        let totalBudget = revenueBudgetEntries.reduce((sum, b) => sum + b.amount, 0);
        let totalRealized = revenueRealizedEntries.reduce((sum, r) => sum + r.amount, 0);
        let totalAnnualRealized = realizedAnnualEntries.reduce((sum, r) => sum + r.amount, 0);

        const customerMap = new Map<string, { total: number; monthly: Record<number, number> }>();

        revenueRealizedEntries.forEach(r => {
            const customerName = normalizeCustomerName(r.customer || r.description || 'Sem Cliente/Outros');
            const monthIdx = r.month - 1; // 0-indexed month
            
            if (!customerMap.has(customerName)) {
                customerMap.set(customerName, { total: 0, monthly: {} });
            }
            
            const data = customerMap.get(customerName)!;
            data.total += r.amount;
            data.monthly[monthIdx] = (data.monthly[monthIdx] || 0) + r.amount;
        });

        // Calculate monthly budgets (Revenue only)
        const monthlyBudgets: Record<number, number> = {};
        revenueBudgetEntries.forEach(b => {
            const m = b.month - 1;
            monthlyBudgets[m] = (monthlyBudgets[m] || 0) + b.amount / 1000;
        });

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
            .filter(c => c.value > 0)
            .sort((a, b) => b.value - a.value);

        // 7. Calculate Margem por Contrato (Centro de Custo)
        const costCenterMap = new Map<string, {
            name: string;
            budgetRev: number;
            budgetTax: number;
            budgetCost: number;
            budgetOpExp: number;
            realizedRev: number;
            realizedTax: number;
            realizedCost: number;
            realizedOpExp: number;
        }>();

        costCenters.forEach(cc => {
            costCenterMap.set(cc.id, {
                name: cc.name,
                budgetRev: 0, budgetTax: 0, budgetCost: 0, budgetOpExp: 0,
                realizedRev: 0, realizedTax: 0, realizedCost: 0, realizedOpExp: 0
            });
        });

        costCenterMap.set('DEFAULT', {
            name: 'Geral / Sem Centro de Custo',
            budgetRev: 0, budgetTax: 0, budgetCost: 0, budgetOpExp: 0,
            realizedRev: 0, realizedTax: 0, realizedCost: 0, realizedOpExp: 0
        });

        realizedEntries.forEach(r => {
            const ccId = r.costCenterId || 'DEFAULT';
            if (!costCenterMap.has(ccId)) {
                costCenterMap.set(ccId, {
                    name: 'Outros / Não Identificado',
                    budgetRev: 0, budgetTax: 0, budgetCost: 0, budgetOpExp: 0,
                    realizedRev: 0, realizedTax: 0, realizedCost: 0, realizedOpExp: 0
                });
            }
            const data = costCenterMap.get(ccId)!;
            const type = categoryTypeMap.get(r.categoryId);
            if (type === 'rev') data.realizedRev += r.amount;
            else if (type === 'tax') data.realizedTax += r.amount;
            else if (type === 'cost') data.realizedCost += r.amount;
            else if (type === 'opExp') data.realizedOpExp += r.amount;
        });

        budgetRaw.forEach(b => {
            const ccId = b.costCenterId || 'DEFAULT';
            if (!costCenterMap.has(ccId)) {
                costCenterMap.set(ccId, {
                    name: 'Outros / Não Identificado',
                    budgetRev: 0, budgetTax: 0, budgetCost: 0, budgetOpExp: 0,
                    realizedRev: 0, realizedTax: 0, realizedCost: 0, realizedOpExp: 0
                });
            }
            const data = costCenterMap.get(ccId)!;
            const type = categoryTypeMap.get(b.categoryId);
            if (type === 'rev') data.budgetRev += b.amount;
            else if (type === 'tax') data.budgetTax += b.amount;
            else if (type === 'cost') data.budgetCost += b.amount;
            else if (type === 'opExp') data.budgetOpExp += b.amount;
        });

        const contractsMargin = Array.from(costCenterMap.entries())
            .map(([id, data]) => {
                const realizedMargin = (data.realizedRev - data.realizedTax - data.realizedCost - data.realizedOpExp) / 1000;
                const budgetMargin = (data.budgetRev - data.budgetTax - data.budgetCost - data.budgetOpExp) / 1000;

                const realizedPercent = data.realizedRev > 0 ? ((data.realizedRev - data.realizedTax - data.realizedCost - data.realizedOpExp) / data.realizedRev) * 100 : 0;
                const budgetPercent = data.budgetRev > 0 ? ((data.budgetRev - data.budgetTax - data.budgetCost - data.budgetOpExp) / data.budgetRev) * 100 : 0;

                const realizedRevThous = data.realizedRev / 1000;
                const budgetRevThous = data.budgetRev / 1000;

                return {
                    id,
                    name: data.name,
                    realizedValue: realizedMargin,
                    budgetValue: budgetMargin,
                    realizedPercent,
                    budgetPercent,
                    realizedRev: realizedRevThous,
                    budgetRev: budgetRevThous
                };
            })
            .filter(c => Math.abs(c.realizedRev) > 0 || Math.abs(c.budgetRev) > 0 || Math.abs(c.realizedValue) > 0 || Math.abs(c.budgetValue) > 0)
            .filter(c => c.id !== 'DEFAULT' || Math.abs(c.realizedRev) > 0)
            .sort((a, b) => b.realizedValue - a.realizedValue);

        return NextResponse.json({
            success: true,
            contracts,
            contractsMargin,
            totalBudget: totalBudget / 1000,
            totalRealized: totalRealized / 1000,
            totalAnnualRealized,
            monthlyBudgets
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
