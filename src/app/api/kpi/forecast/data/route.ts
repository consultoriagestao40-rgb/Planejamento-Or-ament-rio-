import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const normalizeCode = (name: string): string => {
    if (!name) return '';
    if (name.startsWith('synth-')) {
        const parts = name.split('|');
        const codePart = parts[0].replace('synth-', '');
        return codePart.startsWith('0') ? codePart : '0' + codePart;
    }
    const codeMatch = name.match(/^([\d.]+)/);
    if (!codeMatch) return name;
    const code = codeMatch[1];
    const parts = code.split('.');
    if (parts.length > 2) {
        return parts.slice(0, 2).join('.');
    }
    return code;
};

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

        // Calculate consolidated gross revenue for default coefficients (using memory categories since IDs are UUIDs)
        const grossRevCategories = categories.filter(c => {
            const name = c.name || '';
            return name.startsWith('01') || name.startsWith('1.') || c.id.startsWith('synth-1.');
        });
        const grossRevIds = grossRevCategories.map(c => c.id);
        const totalGrossRevenueRealized = filteredRealized
            .filter(r => grossRevIds.includes(r.categoryId))
            .reduce((sum, r) => sum + r.amount, 0);

        // Group categories by unified prefix code
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string; type: string; parentId: string | null }>();
        
        const standardCodes = [
            '01.1', '01.2', '02.1',
            '03.1', '03.2', '03.3', '03.4', '03.5', '03.6', '03.7', '03.8', '03.9', '03.10',
            '04.1', '04.2', '04.3', '04.4', '04.5', '04.6', '04.7', '04.8',
            '05.1', '05.2', '05.3', '05.4', '05.5', '05.6', '05.7', '05.8', '05.9', '05.10', '05.11', '05.12', '05.13',
            '06.1', '06.2', '06.3', '06.4', '06.5', '06.6', '06.7', '06.8',
            '07'
        ];

        standardCodes.forEach(code => {
            const matchedCat = categories.find(c => normalizeCode(c.name) === code);
            const representativeId = matchedCat ? matchedCat.id : `synth-${code}`;
            const representativeName = matchedCat ? matchedCat.name : `synth-${code}`;
            
            uniqueCategoriesMap.set(code, {
                categoryId: representativeId,
                categoryName: representativeName,
                type: (code.startsWith('01') || code.startsWith('1')) ? 'REVENUE' : 'EXPENSE',
                parentId: null
            });
        });

        leafCategories.forEach(cat => {
            const code = normalizeCode(cat.name);
            if (code && !uniqueCategoriesMap.has(code)) {
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
                return normalizeCode(c.name) === code;
            }).map(c => c.id);

            const isGrossRevenue = code === '01.1' || code === '01.2' || code === '01';
            
            let overrideVal: number | undefined = undefined;
            if (overrideMap.has(catInfo.categoryId)) {
                overrideVal = overrideMap.get(catInfo.categoryId);
            } else {
                for (const id of matchedCatIds) {
                    if (overrideMap.has(id)) {
                        overrideVal = overrideMap.get(id);
                        break;
                    }
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
                if (code === '03.2') {
                    pct = 5.5; // Default INSS/Encargos
                } else if (code === '03.4') {
                    pct = 0.5; // Default Diárias (0.5% Cobertura + 0% Extra)
                } else if (code === '03.7') {
                    pct = 0.6; // Default Equipamentos
                } else if (code === '03.8') {
                    pct = 0.1; // Default Comunicação
                } else if (code === '03.9') {
                    pct = 0.4; // Default Veículos
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
                return normalizeCode(c.name) === code;
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

        return NextResponse.json({ success: true, data: gridData });
    } catch (e: any) {
        console.error('[API FORECAST DATA GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
