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

        // 1. Fetch any overrides saved in DB
        const overrides = await prisma.forecastCoefficient.findMany({
            where: { tenantId, year }
        });
        const overrideMap = new Map<string, number>();
        overrides.forEach(o => overrideMap.set(o.categoryId, o.percentage));

        // 2. Load historical realized data for the selected year to calculate defaults
        const realizedData = await prisma.realizedEntry.findMany({
            where: { tenantId, year }
        });

        // 3. Find Receita Bruta (01) historical sum
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
        const totalGrossRevenue = realizedData
            .filter(r => grossRevIds.includes(r.categoryId))
            .reduce((sum, r) => sum + r.amount, 0);

        // 4. Calculate default percentages for all categories relative to Receita Bruta
        const categories = await prisma.category.findMany({
            where: { tenantId }
        });

        const coefficients = categories.map(cat => {
            const isGrossRevenue = grossRevIds.includes(cat.id);
            const overrideVal = overrideMap.get(cat.id);

            let calculatedPercentage = 0;
            if (isGrossRevenue) {
                calculatedPercentage = 100.0;
            } else if (overrideVal !== undefined) {
                calculatedPercentage = overrideVal;
            } else if (totalGrossRevenue > 0) {
                const catSum = realizedData
                    .filter(r => r.categoryId === cat.id)
                    .reduce((sum, r) => sum + r.amount, 0);
                calculatedPercentage = parseFloat(((Math.abs(catSum) / totalGrossRevenue) * 100).toFixed(2));
            }

            // Apply special user rules if no override exists
            if (overrideVal === undefined) {
                const normalizedId = cat.id.toLowerCase();
                const normalizedName = cat.name.toLowerCase();
                
                if (normalizedId.includes('03.2.6') || normalizedId.endsWith('.3.2.6') || normalizedId.endsWith('.03.2.6')) {
                    calculatedPercentage = 5.5; // INSS
                } else if (normalizedName.includes('cobertura')) {
                    calculatedPercentage = 0.5; // Diárias de Cobertura
                } else if (normalizedName.includes('serviço extra') || normalizedName.includes('servico extra')) {
                    calculatedPercentage = 0.0; // Diária de Serviço Extra
                }
            }

            return {
                categoryId: cat.id,
                categoryName: cat.name,
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
