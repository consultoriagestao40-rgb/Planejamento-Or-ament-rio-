import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const year = parseInt(searchParams.get('year') || '0', 10);

        if (!tenantId || !year) {
            return NextResponse.json({ success: false, error: 'Parâmetros ausentes' }, { status: 400 });
        }

        let tenantIds: string[] = [];
        if (tenantId === 'ALL') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            tenantIds = allTenants.map(t => t.id);
        } else {
            tenantIds = [tenantId];
        }

        // 1. Fetch overrides
        const overrides = await prisma.forecastCoefficient.findMany({
            where: { tenantId: { in: tenantIds }, year }
        });
        const overrideMap = new Map<string, number>();
        overrides.forEach(o => overrideMap.set(o.categoryId, o.percentage));

        // 2. Fetch all categories first
        const categories = await prisma.category.findMany({
            where: { tenantId: { in: tenantIds } }
        });

        // Filter out categories that are parent nodes to prevent double counting
        const parentIds = new Set(categories.map(c => c.parentId).filter(Boolean));
        const leafCategories = categories.filter(c => !parentIds.has(c.id));

        // 3. Load historical realized data for the selected year
        const realizedData = await prisma.realizedEntry.findMany({
            where: { tenantId: { in: tenantIds }, year, viewMode: 'competencia' }
        });

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

        // 4. Find Receita Bruta (01) historical sum
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
        const totalGrossRevenue = filteredRealized
            .filter(r => grossRevIds.includes(r.categoryId))
            .reduce((sum, r) => sum + r.amount, 0);

        // Group categories by normalized code/name
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string }>();
        leafCategories.forEach(cat => {
            const name = cat.name;
            const codeMatch = name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : name;
            
            if (!uniqueCategoriesMap.has(code)) {
                uniqueCategoriesMap.set(code, {
                    categoryId: cat.id,
                    categoryName: cat.name
                });
            }
        });

        const coefficients = Array.from(uniqueCategoriesMap.entries()).map(([code, catInfo]) => {
            // Find all database category IDs belonging to this code prefix
            const matchedCatIds = leafCategories.filter(c => {
                const cMatch = c.name.match(/^([\d.]+)/);
                const cCode = cMatch ? cMatch[1] : c.name;
                return cCode === code;
            }).map(c => c.id);

            const isGrossRevenue = matchedCatIds.some(id => grossRevIds.includes(id));
            
            // Check if any matching ID has an override (or fallback to code)
            let overrideVal: number | undefined = undefined;
            for (const id of matchedCatIds) {
                if (overrideMap.has(id)) {
                    overrideVal = overrideMap.get(id);
                    break;
                }
            }

            let calculatedPercentage = 0;
            if (isGrossRevenue) {
                calculatedPercentage = 100.0;
            } else if (overrideVal !== undefined) {
                calculatedPercentage = overrideVal;
            } else if (totalGrossRevenue > 0) {
                const catSum = filteredRealized
                    .filter(r => matchedCatIds.includes(r.categoryId))
                    .reduce((sum, r) => sum + r.amount, 0);
                calculatedPercentage = parseFloat(((Math.abs(catSum) / totalGrossRevenue) * 100).toFixed(2));
            }

            // Apply special user rules if no override exists
            if (overrideVal === undefined) {
                const normalizedCode = code.toLowerCase();
                const normalizedName = catInfo.categoryName.toLowerCase();
                
                if (normalizedCode.includes('03.2.6') || normalizedCode.endsWith('.3.2.6') || normalizedCode.endsWith('.03.2.6')) {
                    calculatedPercentage = 5.5; // INSS
                } else if (normalizedName.includes('cobertura')) {
                    calculatedPercentage = 0.5; // Diárias de Cobertura
                } else if (normalizedName.includes('serviço extra') || normalizedName.includes('servico extra')) {
                    calculatedPercentage = 0.0; // Diária de Serviço Extra
                }
            }

            return {
                categoryId: catInfo.categoryId, // representative ID
                categoryName: catInfo.categoryName,
                percentage: calculatedPercentage,
                isOverride: overrideVal !== undefined
            };
        });

        return NextResponse.json({ success: true, data: coefficients });
    } catch (e: any) {
        console.error('[API FORECAST COEFFICIENTS GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tenantId, year, categoryId, percentage } = body;

        if (!tenantId || !year || !categoryId || percentage === undefined) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        if (tenantId === 'ALL') {
            return NextResponse.json({ success: false, error: 'Não é permitido customizar taxas no modo consolidado. Selecione uma empresa.' }, { status: 400 });
        }

        const coef = await prisma.forecastCoefficient.upsert({
            where: {
                tenantId_categoryId_year: {
                    tenantId,
                    categoryId,
                    year: parseInt(year, 10)
                }
            },
            update: {
                percentage: parseFloat(percentage)
            },
            create: {
                tenantId,
                categoryId,
                year: parseInt(year, 10),
                percentage: parseFloat(percentage)
            }
        });

        return NextResponse.json({ success: true, data: coef });
    } catch (e: any) {
        console.error('[API FORECAST COEFFICIENTS POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
