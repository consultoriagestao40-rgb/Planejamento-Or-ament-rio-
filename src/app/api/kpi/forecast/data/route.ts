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
            const { getAllVariantIds } = await import('@/lib/tenant-utils');
            tenantIds = await getAllVariantIds(tenantId);
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

        const filteredLeafCategories = leafCategories.filter(c => {
            const name = c.name || '';
            const codeMatch = name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';
            if (code === '2' || code === '2.0' || code.startsWith('2.0.')) return false;
            return true;
        });

        // Group categories by unified prefix code (exact leaf code)
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string; type: string; parentId: string | null }>();
        
        filteredLeafCategories.forEach(cat => {
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

            const isGrossRevenue = code === '01.1' || code === '01.2' || code === '01' || code.startsWith('01.');
            
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
            if (overrideVal !== undefined) {
                pct = overrideVal;
            } else if (isGrossRevenue) {
                if (totalGrossRevenueRealized > 0) {
                    const catSum = filteredRealized
                        .filter(r => matchedCatIds.includes(r.categoryId))
                        .reduce((sum, r) => sum + r.amount, 0);
                    pct = (Math.abs(catSum) / totalGrossRevenueRealized) * 100;
                } else {
                    pct = (code === '01.1.1' || code === '1.1.1') ? 100.0 : 0.0;
                }
            } else if (totalGrossRevenueRealized > 0) {
                const catSum = filteredRealized
                    .filter(r => matchedCatIds.includes(r.categoryId))
                    .reduce((sum, r) => sum + r.amount, 0);
                pct = (Math.abs(catSum) / totalGrossRevenueRealized) * 100;
            }

            // Apply special rules
            if (overrideVal === undefined) {
                const defaultPcts: Record<string, number> = {
                    '02.1.1': 12.5,
                    '03.1.1': 30.4,
                    '03.1.2': 1.4,
                    '03.1.3': 0.3,
                    '03.1.5': 0.5,
                    '03.1.10': 1.6,
                    '03.2.1': 2.7,
                    '03.2.2': 2.8,
                    '03.2.3': 3.8,
                    '03.2.4': 1.1,
                    '03.2.6': 5.5,
                    '03.3.1': 2.9,
                    '03.3.2': 11.3,
                    '03.3.4': 0.9,
                    '03.3.6': 0.9,
                    '03.3.7': 0.1,
                    '03.4.1': 0.5,
                    '03.4.2': 0.0,
                    '03.5.1': 0.6,
                    '03.5.2': 0.6,
                    '03.5.3': 0.2,
                    '03.5.5': 0.0,
                    '03.7.1': 0.1,
                    '03.7.2': 0.1,
                    '03.7.4': 0.3,
                    '03.8.2': 0.1,
                    '03.9.2': 0.1,
                    '03.9.3': 0.1,
                    '03.9.8': 0.2
                };

                const nameLower = catInfo.categoryName.toLowerCase();
                
                // Match by code key directly first
                if (defaultPcts[code] !== undefined) {
                    pct = defaultPcts[code];
                } else if (code.startsWith('02.') || code.startsWith('02') || code.startsWith('2.') || code.startsWith('2')) {
                    pct = 0.0; // All other tributos default to zero
                } else if (code.includes('03.2.6') || nameLower.includes('inss')) {
                    pct = 5.5; // INSS
                } else if (code.includes('03.3.2') || nameLower.includes('vale alimentação') || nameLower.includes('vale alimentacao')) {
                    pct = 11.3;
                } else if (code.includes('03.3.4') || nameLower.includes('vale alimentação sobre férias') || nameLower.includes('vale alimentacao sobre ferias') || nameLower.includes('vale alimentação sobre ferias') || nameLower.includes('vale alimentacao sobre férias')) {
                    pct = 0.9;
                } else if (code.includes('03.4.1') || nameLower.includes('cobertura')) {
                    pct = 0.5; // Diárias de Cobertura
                } else if (code.includes('03.4.2') || nameLower.includes('serviço extra') || nameLower.includes('servico extra')) {
                    pct = 0.0; // Diária de Serviço Extra
                } else if (code.includes('03.7.1') || nameLower.includes('não depreciáveis') || nameLower.includes('nao depreciaveis')) {
                    pct = 0.1;
                } else if (code.includes('03.7.2') || nameLower.includes('depreciação de equipamentos') || nameLower.includes('depreciacao de equipamentos')) {
                    pct = 0.1;
                } else if (code.includes('03.7.4') || nameLower.includes('manutenção de equipamentos') || nameLower.includes('manutencao de equipamentos')) {
                    pct = 0.3;
                } else if (code.includes('03.8.2') || nameLower.includes('ponto digital')) {
                    pct = 0.1;
                } else if (code.includes('03.9.2') || nameLower.includes('manutenção de veículos') || nameLower.includes('manutencao de veiculos')) {
                    pct = 0.1;
                } else if (code.includes('03.9.3') || nameLower.includes('combustível') || nameLower.includes('combustivel')) {
                    pct = 0.1;
                } else if (code.includes('03.9.8') || nameLower.includes('seguro dos veículos') || nameLower.includes('seguros de veículos') || nameLower.includes('seguro de veiculo')) {
                    pct = 0.2;
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
                    const isRevenue = catInfo.type === 'REVENUE' || matchedCatIds.some(id => grossRevIds.includes(id));
                    let simulatedImpact = 0;

                    const isRevenueOrCostOrTax = 
                        code.startsWith('01') || code.startsWith('1') ||
                        code.startsWith('02') || code.startsWith('2') ||
                        code.startsWith('03') || code.startsWith('3');

                    if (isRevenueOrCostOrTax) {
                        if (isRevenue) {
                            contracts.forEach(contract => {
                                if (monthNum >= contract.startMonth) {
                                    const multiplier = contract.status === 'VENDIDO' ? 1.0 : (contract.probability / 100.0);
                                    let cleanName = contract.name;
                                    if (cleanName.includes(' |__CASHFLOW__Reference:')) {
                                        cleanName = cleanName.split(' |__CASHFLOW__Reference:')[0];
                                    }
                                    if (cleanName.includes(' |__CASHFLOW__:')) {
                                        cleanName = cleanName.split(' |__CASHFLOW__:')[0];
                                    }

                                    let customSplit: Record<string, number> = {};
                                    let hasCustomSplit = false;
                                    if (cleanName.includes(' |__SPLIT__:')) {
                                        try {
                                            const parts = cleanName.split(' |__SPLIT__:');
                                            const rest = parts[1];
                                            const splitStr = rest.includes(' |__SELLER__:') ? rest.split(' |__SELLER__:')[0] : rest;
                                            customSplit = JSON.parse(splitStr);
                                            if (Object.keys(customSplit).length > 0) {
                                                hasCustomSplit = true;
                                            }
                                        } catch (e) {
                                            console.error('Failed to parse split JSON:', e);
                                        }
                                    }

                                    if (hasCustomSplit) {
                                        const splitVal = customSplit[code] || 0;
                                        simulatedImpact += splitVal * multiplier;
                                    } else {
                                        // Fallback: split based on coefficient
                                        const coef = coefMap.get(code) || 0;
                                        simulatedImpact += contract.value * coef * multiplier;
                                    }
                                }
                            });
                        } else {
                            let totalSimulatedRevenue = 0;
                            contracts.forEach(contract => {
                                if (monthNum >= contract.startMonth) {
                                    const multiplier = contract.status === 'VENDIDO' ? 1.0 : (contract.probability / 100.0);
                                    totalSimulatedRevenue += contract.value * multiplier;
                                }
                            });
                            const coef = coefMap.get(code) || 0;
                            simulatedImpact = totalSimulatedRevenue * coef;
                        }
                    }

                    monthlyForecast[m] = baseValue + Math.abs(simulatedImpact);
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
