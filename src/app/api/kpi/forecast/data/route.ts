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

        // 1. Fetch Realized data
        const realizedData = await prisma.realizedEntry.findMany({
            where: { tenantId, year }
        });

        // 2. Fetch Budget data
        const budgetData = await prisma.budgetEntry.findMany({
            where: { tenantId, year }
        });

        // 3. Fetch Simulated Forecast Contracts
        const contracts = await prisma.forecastContract.findMany({
            where: { tenantId, startYear: year, status: { in: ['PIPELINE', 'VENDIDO'] } }
        });

        // 4. Fetch Coefficients / Overrides
        const overrides = await prisma.forecastCoefficient.findMany({
            where: { tenantId, year }
        });
        const overrideMap = new Map<string, number>();
        overrides.forEach(o => overrideMap.set(o.categoryId, o.percentage));

        // Calculate default coefficients from historical Realizado
        const grossRevCategories = await prisma.category.findMany({
            where: {
                tenantId,
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
            where: { tenantId }
        });

        // Coef Map of percentage divided by 100
        const coefMap = new Map<string, number>();
        categories.forEach(cat => {
            const isGrossRevenue = grossRevIds.includes(cat.id);
            const overrideVal = overrideMap.get(cat.id);
            let pct = 0;

            if (isGrossRevenue) {
                pct = 100.0;
            } else if (overrideVal !== undefined) {
                pct = overrideVal;
            } else if (totalGrossRevenueRealized > 0) {
                const catSum = realizedData
                    .filter(r => r.categoryId === cat.id)
                    .reduce((sum, r) => sum + r.amount, 0);
                pct = (Math.abs(catSum) / totalGrossRevenueRealized) * 100;
            }

            // Apply special rules
            if (overrideVal === undefined) {
                const normalizedId = cat.id.toLowerCase();
                const normalizedName = cat.name.toLowerCase();
                
                if (normalizedId.includes('03.2.6') || normalizedId.endsWith('.3.2.6') || normalizedId.endsWith('.03.2.6')) {
                    pct = 5.5; // INSS
                } else if (normalizedName.includes('cobertura')) {
                    pct = 0.5; // Cobertura
                } else if (normalizedName.includes('serviço extra') || normalizedName.includes('servico extra')) {
                    pct = 0.0; // Extra
                }
            }

            coefMap.set(cat.id, pct / 100.0);
        });

        // 5. Build DRE Grid Data
        const gridData = categories.map(cat => {
            const monthlyRealized = Array(12).fill(0);
            const monthlyBudget = Array(12).fill(0);
            const monthlyForecast = Array(12).fill(0);

            // Populate Realized and Budget
            realizedData.filter(r => r.categoryId === cat.id).forEach(r => {
                if (r.month >= 1 && r.month <= 12) {
                    monthlyRealized[r.month - 1] += r.amount;
                }
            });

            budgetData.filter(b => b.categoryId === cat.id).forEach(b => {
                if (b.month >= 1 && b.month <= 12) {
                    monthlyBudget[b.month - 1] += b.amount;
                }
            });

            // Calculate Forecast
            for (let m = 0; m < 12; m++) {
                const monthNum = m + 1;
                if (monthNum <= activeMonth) {
                    // Past months are strictly Realized
                    monthlyForecast[m] = monthlyRealized[m];
                } else {
                    // Future months are Original Budget + Simulated New Contracts
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
                    const coef = coefMap.get(cat.id) || 0;
                    const isRevenue = cat.type === 'REVENUE' || grossRevIds.includes(cat.id);
                    const simulatedImpact = simulatedRevenue * coef;

                    // If it is an expense, it should be negative (offsetting DRE)
                    if (isRevenue) {
                        monthlyForecast[m] = baseValue + simulatedImpact;
                    } else {
                        monthlyForecast[m] = baseValue - simulatedImpact; // Deduct simulated expense
                    }
                }
            }

            return {
                categoryId: cat.id,
                categoryName: cat.name,
                type: cat.type,
                parentId: cat.parentId,
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
