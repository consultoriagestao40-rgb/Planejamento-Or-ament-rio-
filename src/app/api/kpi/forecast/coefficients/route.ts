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

        const filteredLeafCategories = leafCategories.filter(c => {
            const name = c.name || '';
            const codeMatch = name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';
            if (code === '2' || code.startsWith('2.') || code.startsWith('2')) return false;
            return code.startsWith('01.') || code.startsWith('02.') || code.startsWith('03.') ||
                   code.startsWith('1.') || code.startsWith('3.') ||
                   c.id.startsWith('synth-1.') || c.id.startsWith('synth-2.') || c.id.startsWith('synth-3.');
        });

        // Group categories by unified prefix code (exact leaf code)
        const uniqueCategoriesMap = new Map<string, { categoryId: string; categoryName: string }>();
        filteredLeafCategories.forEach(cat => {
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
            // Find all database category IDs belonging to this exact leaf code prefix
            const matchedCatIds = leafCategories.filter(c => {
                const cMatch = c.name.match(/^([\d.]+)/);
                const cCode = cMatch ? cMatch[1] : c.name;
                return cCode === code;
            }).map(c => c.id);

            const isGrossRevenue = code === '01.1' || code === '01.2' || code === '01' || code.startsWith('01.');
            
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
            if (overrideVal !== undefined) {
                calculatedPercentage = overrideVal;
            } else if (isGrossRevenue) {
                if (totalGrossRevenue > 0) {
                    const catSum = filteredRealized
                        .filter(r => matchedCatIds.includes(r.categoryId))
                        .reduce((sum, r) => sum + r.amount, 0);
                    calculatedPercentage = parseFloat(((Math.abs(catSum) / totalGrossRevenue) * 100).toFixed(2));
                } else {
                    calculatedPercentage = (code === '01.1.1' || code === '1.1.1') ? 100.0 : 0.0;
                }
            } else if (totalGrossRevenue > 0) {
                const catSum = filteredRealized
                    .filter(r => matchedCatIds.includes(r.categoryId))
                    .reduce((sum, r) => sum + r.amount, 0);
                calculatedPercentage = parseFloat(((Math.abs(catSum) / totalGrossRevenue) * 100).toFixed(2));
            }

            // Apply special default rules from the prints if there is no user override
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
                    calculatedPercentage = defaultPcts[code];
                } else if (code.startsWith('02.') || code.startsWith('02') || code.startsWith('2.') || code.startsWith('2')) {
                    calculatedPercentage = 0.0; // All other tributos default to zero
                } else if (code.includes('03.2.6') || nameLower.includes('inss')) {
                    calculatedPercentage = 5.5; // INSS
                } else if (code.includes('03.3.2') || nameLower.includes('vale alimentação') || nameLower.includes('vale alimentacao')) {
                    calculatedPercentage = 11.3;
                } else if (code.includes('03.3.4') || nameLower.includes('vale alimentação sobre férias') || nameLower.includes('vale alimentacao sobre ferias') || nameLower.includes('vale alimentação sobre ferias') || nameLower.includes('vale alimentacao sobre férias')) {
                    calculatedPercentage = 0.9;
                } else if (code.includes('03.4.1') || nameLower.includes('cobertura')) {
                    calculatedPercentage = 0.5; // Diárias de Cobertura
                } else if (code.includes('03.4.2') || nameLower.includes('serviço extra') || nameLower.includes('servico extra')) {
                    calculatedPercentage = 0.0; // Diária de Serviço Extra
                } else if (code.includes('03.7.1') || nameLower.includes('não depreciáveis') || nameLower.includes('nao depreciaveis')) {
                    calculatedPercentage = 0.1;
                } else if (code.includes('03.7.2') || nameLower.includes('depreciação de equipamentos') || nameLower.includes('depreciacao de equipamentos')) {
                    calculatedPercentage = 0.1;
                } else if (code.includes('03.7.4') || nameLower.includes('manutenção de equipamentos') || nameLower.includes('manutencao de equipamentos')) {
                    calculatedPercentage = 0.3;
                } else if (code.includes('03.8.2') || nameLower.includes('ponto digital')) {
                    calculatedPercentage = 0.1;
                } else if (code.includes('03.9.2') || nameLower.includes('manutenção de veículos') || nameLower.includes('manutencao de veiculos')) {
                    calculatedPercentage = 0.1;
                } else if (code.includes('03.9.3') || nameLower.includes('combustível') || nameLower.includes('combustivel')) {
                    calculatedPercentage = 0.1;
                } else if (code.includes('03.9.8') || nameLower.includes('seguro dos veículos') || nameLower.includes('seguros de veículos') || nameLower.includes('seguro de veiculo')) {
                    calculatedPercentage = 0.2;
                }
            }

            return {
                categoryId: catInfo.categoryId,
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

        let tenantIds: string[] = [];
        if (tenantId === 'ALL') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            tenantIds = allTenants.map(t => t.id);
        } else {
            tenantIds = [tenantId];
        }

        // We need to find the category name and code for the given categoryId
        let categoryName = '';
        let categoryCode = '';
        if (categoryId.startsWith('synth-')) {
            const codePart = categoryId.replace('synth-', '');
            categoryCode = codePart.split('|')[0];
        } else {
            const sourceCategory = await prisma.category.findUnique({
                where: { id: categoryId }
            });
            if (sourceCategory) {
                categoryName = sourceCategory.name;
                const codeMatch = categoryName.match(/^([\d.]+)/);
                categoryCode = codeMatch ? codeMatch[1] : '';
            }
        }

        // Upsert for each tenant
        for (const tId of tenantIds) {
            let targetCategoryId = categoryId;
            if (tenantId === 'ALL' || categoryId.startsWith('synth-')) {
                const tenantCategory = await prisma.category.findFirst({
                    where: {
                        tenantId: tId,
                        OR: [
                            { id: categoryId },
                            { name: categoryName },
                            { name: { startsWith: categoryCode + ' ' } },
                            { name: { startsWith: categoryCode + ' - ' } }
                        ]
                    }
                });
                if (tenantCategory) {
                    targetCategoryId = tenantCategory.id;
                } else if (categoryId.startsWith('synth-')) {
                    // Fallback to exact string if it is a synthetic string ID
                    targetCategoryId = categoryId;
                } else {
                    continue; // Skip if this tenant doesn't have this category
                }
            }

            await prisma.forecastCoefficient.upsert({
                where: {
                    tenantId_categoryId_year: {
                        tenantId: tId,
                        categoryId: targetCategoryId,
                        year: parseInt(year.toString(), 10)
                    }
                },
                update: {
                    percentage: parseFloat(percentage.toString())
                },
                create: {
                    tenantId: tId,
                    categoryId: targetCategoryId,
                    year: parseInt(year.toString(), 10),
                    percentage: parseFloat(percentage.toString())
                }
            });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[API FORECAST COEFFICIENTS POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
