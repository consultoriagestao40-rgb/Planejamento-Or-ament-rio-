import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const formatCategoryName = (name: string): string => {
    if (!name) return '';
    if (name.startsWith('synth-')) {
        const parts = name.split('|');
        const codePart = parts[0].replace('synth-', '');
        const normalizedCode = codePart.startsWith('0') ? codePart : '0' + codePart;
        
        const standardNames: Record<string, string> = {
            '01.1': '01.1 - Receita de Serviços',
            '01.2': '01.2 - Receitas de Vendas',
            '02.1': '02.1 - Tributos',
            '03.1': '03.1 - Salários e Remuneração',
            '03.2': '03.2 - Encargos Sociais',
            '03.3': '03.3 - Benefícios',
            '03.4': '03.4 - Diárias',
            '03.5': '03.5 - SSMA',
            '03.6': '03.6 - Materiais',
            '03.7': '03.7 - Equipamentos',
            '03.8': '03.8 - Comunicação/Sistema/Licenças',
            '03.9': '03.9 - Custo com Veículo',
            '03.10': '03.10 - Custos Transferidos',
            '04.1': '04.1 - Salários e Remuneração',
            '04.2': '04.2 - Encargos Sociais',
            '04.3': '04.3 - Benefícios',
            '04.4': '04.4 - SSMA',
            '04.5': '04.5 - Viagens',
            '04.6': '04.6 - Custo com Veículos',
            '04.7': '04.7 - Cartão Corporativo',
            '04.8': '04.8 - Serviços Terceirizados',
            '05.1': '05.1 - Salários e Remuneração',
            '05.2': '05.2 - Encargos Sociais',
            '05.3': '05.3 - Benefícios',
            '05.4': '05.4 - SSMA',
            '05.5': '05.5 - Viagens',
            '05.6': '05.6 - Despesa com Sócios',
            '05.7': '05.7 - Serviços Contratados',
            '05.8': '05.8 - Despesa Comercial/Marketing',
            '05.9': '05.9 - Despesa com Estrutura',
            '05.10': '05.10 - Despesa Copa e Cozinha',
            '05.11': '05.11 - Despesa com Veículos',
            '05.12': '05.12 - Despesa de Informática',
            '05.13': '05.13 - Taxas e Despesas Legais',
            '06.1': '06.1 - Entradas Financeiras',
            '06.2': '06.2 - Saídas Financeiras',
            '06.3': '06.3 - Financiamento',
            '06.4': '06.4 - Juros/Multas',
            '06.5': '06.5 - Passivo Trabalhista',
            '06.6': '06.6 - Depreciação',
            '06.7': '06.7 - Cartão de Crédito',
            '06.8': '06.8 - PDD',
            '07': '07. Investimentos'
        };
        
        return standardNames[normalizedCode] || standardNames[codePart] || name;
    }
    return name;
};

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

        // 4. Find Receita Bruta (01) historical sum (using memory categories since IDs are UUIDs)
        const grossRevCategories = categories.filter(c => {
            const name = c.name || '';
            return name.startsWith('01') || name.startsWith('1.') || c.id.startsWith('synth-1.');
        });
        const grossRevIds = grossRevCategories.map(c => c.id);
        const totalGrossRevenue = filteredRealized
            .filter(r => grossRevIds.includes(r.categoryId))
            .reduce((sum, r) => sum + r.amount, 0);

        // Group categories by normalized code/name
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string }>();
        
        // Prepopulate with standard codes to guarantee all standard subcategories are returned
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
                categoryName: representativeName
            });
        });

        // Add any other custom codes that aren't standard
        leafCategories.forEach(cat => {
            const code = normalizeCode(cat.name);
            if (code && !uniqueCategoriesMap.has(code)) {
                uniqueCategoriesMap.set(code, {
                    categoryId: cat.id,
                    categoryName: cat.name
                });
            }
        });

        const coefficients = Array.from(uniqueCategoriesMap.entries()).map(([code, catInfo]) => {
            // Find all database category IDs belonging to this code prefix
            const matchedCatIds = leafCategories.filter(c => {
                return normalizeCode(c.name) === code;
            }).map(c => c.id);

            const isGrossRevenue = code === '01.1' || code === '01.2' || code === '01';
            
            // Check if any matching ID or the representative ID has an override
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
                if (code === '03.2') {
                    calculatedPercentage = 5.5; // Default INSS/Encargos
                } else if (code === '03.4') {
                    calculatedPercentage = 0.5; // Default Diárias (0.5% Cobertura + 0% Extra)
                } else if (code === '03.7') {
                    calculatedPercentage = 0.6; // Default Equipamentos
                } else if (code === '03.8') {
                    calculatedPercentage = 0.1; // Default Comunicação
                } else if (code === '03.9') {
                    calculatedPercentage = 0.4; // Default Veículos
                }
            }

            return {
                categoryId: catInfo.categoryId, // representative ID
                categoryName: formatCategoryName(catInfo.categoryName),
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
