import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const year = parseInt(searchParams.get('year') || '0', 10);
        const activeMonth = parseInt(searchParams.get('activeMonth') || '0', 10); // 1-12

        if (!tenantId || !year || !activeMonth) {
            return NextResponse.json({ success: false, error: 'Parâmetros ausentes' }, { status: 400 });
        }

        let tenantIds: string[] = [];
        if (tenantId === 'ALL') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            tenantIds = allTenants.map(t => t.id);
        } else {
            tenantIds = [tenantId];
        }

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
        const totalGrossRevenueRealized = realizedData
            .filter(r => grossRevIds.includes(r.categoryId))
            .reduce((sum, r) => sum + r.amount, 0);

        const categories = await prisma.category.findMany({
            where: { tenantId: { in: tenantIds } }
        });

        // Group categories by unified prefix code
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string; type: string; parentId: string | null }>();
        categories.forEach(cat => {
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
            const matchedCatIds = categories.filter(c => {
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
                const catSum = realizedData
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
            const matchedCatIds = categories.filter(c => {
                const cMatch = c.name.match(/^([\d.]+)/);
                const cCode = cMatch ? cMatch[1] : c.name;
                return cCode === code;
            }).map(c => c.id);

            // Populate Realized and Budget
            realizedData.filter(r => matchedCatIds.includes(r.categoryId)).forEach(r => {
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

        return NextResponse.json({ success: true, data: gridData });
    } catch (e: any) {
        console.error('[API FORECAST DATA GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
