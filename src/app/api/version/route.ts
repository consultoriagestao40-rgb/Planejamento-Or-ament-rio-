import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'ALL';
        const year = 2026;
        const activeMonth = 6;

        const allTenants = await prisma.tenant.findMany({ select: { id: true } });
        const tenantIds = allTenants.map(t => t.id);

        // 1. Fetch Realized data
        const realizedData = await prisma.realizedEntry.findMany({
            where: { tenantId: { in: tenantIds }, year, viewMode: 'competencia' }
        });

        // 2. Fetch Budget data
        const budgetData = await prisma.budgetEntry.findMany({
            where: { tenantId: { in: tenantIds }, year }
        });

        // 3. Fetch Simulated Forecast Contracts
        const contracts = await prisma.forecastContract.findMany({
            where: { tenantId: { in: tenantIds }, startYear: year, status: { in: ['PIPELINE', 'VENDIDO'] } }
        });

        // 4. Fetch Coefficients / Overrides
        const overrides = await prisma.forecastCoefficient.findMany({
            where: { tenantId: { in: tenantIds }, year }
        });
        const overrideMap = new Map<string, number>();
        overrides.forEach(o => overrideMap.set(o.categoryId, o.percentage));

        // 5. Fetch all categories first
        const categories = await prisma.category.findMany({
            where: { tenantId: { in: tenantIds } }
        });

        // Filter out categories that are parent nodes to prevent double counting
        const parentIds = new Set(categories.map(c => c.parentId).filter(Boolean));
        const leafCategories = categories.filter(c => !parentIds.has(c.id));

        // Synced months detection to prevent manual + sync overlap
        const syncedMonths = new Set<string>();
        realizedData.forEach(e => {
            if (e.externalId && e.externalId.startsWith('sync-')) {
                syncedMonths.add(`${e.year}|${e.month}`);
            }
        });

        const isConsolidated = tenantId === 'ALL';
        const filteredRealized = realizedData.filter(e => {
            const key = `${e.year}|${e.month}`;
            if (syncedMonths.has(key)) {
                if (!e.externalId || !(
                    e.externalId.startsWith('sync-') ||
                    e.externalId.startsWith('adj-') ||
                    e.externalId.startsWith('transf-')
                )) {
                    return false;
                }
            }

            // Exclude transfer categories
            const cat = categories.find(c => c.id === e.categoryId);
            if (cat) {
                const name = cat.name;
                const codeMatch = name.match(/^([\d.]+)/);
                const code = codeMatch ? codeMatch[1] : '';
                if (code === '6.1.2' || code === '06.1.2' || code === '6.2.2' || code === '06.2.2') return false;
                if (isConsolidated && (code === '6.1.1' || code === '06.1.1' || code === '6.2.1' || code === '06.2.1')) return false;
            }
            return true;
        });

        // Calculate consolidated gross revenue for default coefficients
        const grossRevCategories = await prisma.category.findMany({
            where: {
                tenantId: { in: tenantIds },
                OR: [
                    { id: { startsWith: 'synth-1.' } },
                    { id: { startsWith: '01.' } },
                    { id: { startsWith: '1.' } }
                ]
            }
        });
        const grossRevIds = grossRevCategories.map(c => c.id);
        const totalGrossRevenueRealized = filteredRealized
            .filter(r => grossRevIds.includes(r.categoryId))
            .reduce((sum, r) => sum + r.amount, 0);

        // Group categories by unified prefix code
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string; type: string; parentId: string | null }>();
        leafCategories.forEach(cat => {
            const name = cat.name;
            const codeMatch = name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : name;

            if (!uniqueCategoriesMap.has(code)) {
                uniqueCategoriesMap.set(code, {
                    categoryId: cat.id,
                    categoryName: cat.name,
                    type: cat.type,
                    parentId: cat.parentId
                });
            }
        });

        // Coef Map of percentage divided by 100 for unified code prefixes
        const coefMap = new Map<string, number>();
        uniqueCategoriesMap.forEach((catInfo, code) => {
            const matchedCatIds = leafCategories.filter(c => {
                const cMatch = c.name.match(/^([\d.]+)/);
                const cCode = cMatch ? cMatch[1] : c.name;
                return cCode === code;
            }).map(c => c.id);

            const isGrossRevenue = matchedCatIds.some(id => grossRevIds.includes(id));
            
            let overrideVal: number | undefined = undefined;
            for (const id of matchedCatIds) {
                if (overrideMap.has(id)) {
                    overrideVal = overrideMap.get(id);
                    break;
                }
            }

            let pct = 0;
            if (isGrossRevenue) {
                pct = 100.0;
            } else if (overrideVal !== undefined) {
                pct = overrideVal;
            } else if (totalGrossRevenueRealized > 0) {
                const catSum = filteredRealized
                    .filter(r => matchedCatIds.includes(r.categoryId))
                    .reduce((sum, r) => sum + r.amount, 0);
                pct = (Math.abs(catSum) / totalGrossRevenueRealized) * 100;
            }

            // Apply special rules
            if (overrideVal === undefined) {
                const normalizedCode = code.toLowerCase();
                const normalizedName = catInfo.categoryName.toLowerCase();
                
                if (normalizedCode.includes('03.2.6') || normalizedCode.endsWith('.3.2.6') || normalizedCode.endsWith('.03.2.6')) {
                    pct = 5.5; // INSS
                } else if (normalizedName.includes('cobertura')) {
                    pct = 0.5; // Cobertura
                } else if (normalizedName.includes('serviço extra') || normalizedName.includes('servico extra')) {
                    pct = 0.0; // Extra
                }
            }

            coefMap.set(code, pct / 100.0);
        });

        // 5. Build DRE Grid Data (consolidating matching codes from all tenants)
        const gridData = Array.from(uniqueCategoriesMap.entries()).map(([code, catInfo]) => {
            const monthlyRealized = Array(12).fill(0);
            const monthlyBudget = Array(12).fill(0);
            const monthlyForecast = Array(12).fill(0);

            // Find all matching database category IDs for this prefix
            const matchedCatIds = leafCategories.filter(c => {
                const cMatch = c.name.match(/^([\d.]+)/);
                const cCode = cMatch ? cMatch[1] : c.name;
                return cCode === code;
            }).map(c => c.id);

            // Populate Realized and Budget
            filteredRealized.filter(r => matchedCatIds.includes(r.categoryId)).forEach(r => {
                if (r.month >= 1 && r.month <= 12) {
                    monthlyRealized[r.month - 1] += r.amount;
                }
            });

            budgetData.filter(b => matchedCatIds.includes(b.categoryId)).forEach(b => {
                if (b.month >= 1 && b.month <= 12) {
                    monthlyBudget[b.month - 1] += b.amount;
                }
            });

            // Calculate Forecast
            for (let m = 0; m < 12; m++) {
                const monthNum = m + 1;
                if (monthNum <= activeMonth) {
                    monthlyForecast[m] = monthlyRealized[m];
                } else {
                    let baseValue = monthlyBudget[m];

                    // Simulate new contracts impact
                    let simulatedRevenue = 0;
                    contracts.forEach(contract => {
                        if (monthNum >= contract.startMonth) {
                            const multiplier = contract.status === 'VENDIDO' ? 1.0 : (contract.probability / 100.0);
                            simulatedRevenue += contract.value * multiplier;
                        }
                    });

                    // Project cost or revenue impact based on coefficients
                    const coef = coefMap.get(code) || 0;
                    const isRevenue = catInfo.type === 'REVENUE' || matchedCatIds.some(id => grossRevIds.includes(id));
                    const simulatedImpact = simulatedRevenue * coef;

                    if (isRevenue) {
                        monthlyForecast[m] = baseValue + simulatedImpact;
                    } else {
                        monthlyForecast[m] = baseValue - simulatedImpact;
                    }
                }
            }

            return {
                categoryId: catInfo.categoryId, // representative ID
                categoryName: catInfo.categoryName,
                type: catInfo.type,
                parentId: catInfo.parentId,
                realized: monthlyRealized,
                budget: monthlyBudget,
                forecast: monthlyForecast
            };
        });

        // Let's filter for revenue starting with 01 and calculate totals for January (month 0)
        const janRevenueList = gridData.filter(item => item.categoryName.startsWith('01') || item.categoryName.startsWith('1.'));
        const totalJanRevenue = janRevenueList.reduce((sum, item) => sum + item.realized[0], 0);

        return NextResponse.json({ 
            success: true, 
            syncedMonths: Array.from(syncedMonths),
            totalJanRevenue, 
            janRevenueList: janRevenueList.map(item => ({
                code: item.categoryName.split(' - ')[0],
                name: item.categoryName,
                janRealized: item.realized[0]
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
