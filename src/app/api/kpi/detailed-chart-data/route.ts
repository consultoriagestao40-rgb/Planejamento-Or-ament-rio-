import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAllVariantIds } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

interface CategoryNode {
    id: string;
    name: string;
    code: string;
    children: CategoryNode[];
    level: number;
    isSynthetic: boolean;
    tenantId: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get('categoryId');
        const filterTenantId = searchParams.get('filterTenantId') || 'ALL';
        const filterCCId = searchParams.get('filterCCId') || 'ALL';
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';

        if (!categoryId) {
            return NextResponse.json({ success: false, error: 'Parâmetro categoryId ausente' }, { status: 400 });
        }

        // 1. Resolve Variant Tenant IDs
        let targetTenantIds: string[] = [];
        if (filterTenantId === 'ALL' || filterTenantId === 'DEFAULT') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            targetTenantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = filterTenantId.split(',').map(id => id.trim()).filter(Boolean);
            const variantSets = await Promise.all(requestedIds.map(id => getAllVariantIds(id)));
            targetTenantIds = Array.from(new Set(variantSets.flat()));
        }

        // Apply cost center filter
        const ccFilter: any = {};
        if (filterCCId && filterCCId !== 'ALL' && filterCCId !== 'DEFAULT') {
            const requestedCCIds = filterCCId.split(',').map(id => id.trim()).filter(Boolean);
            const selectedCCs = await prisma.costCenter.findMany({
                where: { id: { in: requestedCCIds } },
                select: { name: true, tenantId: true }
            });
            
            const normalizeCCName = (name: string) => 
                (name || '')
                    .toLowerCase()
                    .replace(/^[\d. ]+-?\s*/, '')
                    .replace(/[^a-z0-9]/g, '')
                    .replace(/merces/g, 'meces')
                    .trim();

            const allSynonymousCCIds = new Set<string>(requestedCCIds);
            if (selectedCCs.length > 0) {
                const targetNorms = selectedCCs.map(cc => normalizeCCName(cc.name));
                const synonymousCCs = await prisma.costCenter.findMany({
                    where: { tenantId: { in: targetTenantIds } },
                    select: { id: true, name: true }
                });
                synonymousCCs.forEach(cc => {
                    const cn = normalizeCCName(cc.name);
                    if (targetNorms.some(tn => cn.includes(tn) || tn.includes(cn))) {
                        allSynonymousCCIds.add(cc.id);
                    }
                });
            }
            ccFilter.costCenterId = { in: Array.from(allSynonymousCCIds) };
        }

        // Query raw Budget and Realized entries
        const [realizedRaw, budgetRaw] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    year,
                    viewMode,
                    ...ccFilter
                },
                include: { category: true }
            }),
            prisma.budgetEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    year,
                    ...ccFilter
                },
                include: { category: true }
            })
        ]);

        // Deduplicate realized raw values (standard logic: sync- prefix overrides manual ones)
        const syncedMonths = new Set<string>();
        realizedRaw.forEach(e => {
            if (e.externalId && e.externalId.startsWith('sync-')) {
                syncedMonths.add(`${e.year}|${e.month}`);
            }
        });
        const realizedEntriesRaw = realizedRaw.filter(e => {
            const key = `${e.year}|${e.month}`;
            if (syncedMonths.has(key)) {
                return e.externalId && e.externalId.startsWith('sync-');
            }
            return true;
        });

        // Get categories
        const categories = await prisma.category.findMany({
            where: { tenantId: { in: targetTenantIds } }
        });

        const categoryNameMap = new Map<string, string>();
        categories.forEach(c => {
            categoryNameMap.set(c.id, c.name);
            if (c.id.includes(':')) {
                const code = c.id.split(':')[1];
                if (!categoryNameMap.has(code)) {
                    categoryNameMap.set(code, c.name);
                }
            }
        });

        const requestedTenantIds = filterTenantId.split(',').map(id => id.trim()).filter(Boolean);
        const isConsolidated = filterTenantId === 'ALL' || filterTenantId === 'DEFAULT' || requestedTenantIds.length > 1;

        const getCleanCode = (name: string) => {
            const match = name.match(/^(\d{1,2}(?:\.\d+)*)/);
            return match ? match[1] : '';
        };

        const realizedEntries = realizedEntriesRaw.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const code = getCleanCode(catName);
            if (code === '06.1.2' || code === '06.2.2') return false;
            if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
            return true;
        });

        const budgetEntries = budgetRaw.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const code = getCleanCode(catName);
            if (code === '06.1.2' || code === '06.2.2') return false;
            if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
            return true;
        });

        // Aggregate realized and budgets like `/api/sync`
        const realizedValues: Record<string, number> = {};
        const budgetValues: Record<string, { amount: number }> = {};

        realizedEntries.forEach((e: any) => {
            const idKey = `realized-${e.categoryId}-${e.month - 1}`;
            realizedValues[idKey] = (realizedValues[idKey] || 0) + e.amount;

            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `${normalizedName}|${e.month - 1}`;
                realizedValues[nameKey] = (realizedValues[nameKey] || 0) + e.amount;

                // Revenue aggregator
                const isRevenue = normalizedName.startsWith('01');
                if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                    const parentKey = `01RECEITABRUTA|${e.month - 1}`;
                    realizedValues[parentKey] = (realizedValues[parentKey] || 0) + e.amount;
                }
            }
        });

        budgetEntries.forEach((e: any) => {
            const idKey = `${e.categoryId}-${e.month - 1}`;
            budgetValues[idKey] = { amount: (budgetValues[idKey]?.amount || 0) + e.amount };

            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `budget-${normalizedName}|${e.month - 1}`;
                budgetValues[nameKey] = { amount: (budgetValues[nameKey]?.amount || 0) + e.amount };

                // Revenue aggregator
                const isRevenue = normalizedName.startsWith('01');
                if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                    const parentKey = `budget-01RECEITABRUTA|${e.month - 1}`;
                    budgetValues[parentKey] = { amount: (budgetValues[parentKey]?.amount || 0) + e.amount };
                }
            }
        });

        // 2. Build Category Tree
        const map = new Map<string, CategoryNode>();
        const codeMap = new Map<string, CategoryNode>();
        const nameMap = new Map<string, CategoryNode>();

        categories.forEach((cat: any) => {
            const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            const uniqueKey = `${cat.type}|${cleanCode || cat.name.trim()}`;

            if (nameMap.has(uniqueKey)) {
                const existingNode = nameMap.get(uniqueKey)!;
                if (!existingNode.id.split(',').includes(cat.id)) {
                    existingNode.id += ',' + cat.id;
                }
                map.set(cat.id, existingNode);
                return;
            }

            const node: CategoryNode = {
                ...cat,
                name: cat.name,
                code: cleanCode,
                children: [],
                level: 0,
                isSynthetic: false,
                tenantId: cat.tenantId
            };
            map.set(cat.id, node);
            if (cat.id.includes(':')) {
                map.set(cat.id.split(':')[1], node);
            }
            nameMap.set(uniqueKey, node);
            if (cleanCode) {
                codeMap.set(cleanCode, node);
                if (!cleanCode.startsWith('0') && cleanCode.length > 0) codeMap.set(`0${cleanCode}`, node);
            }
        });

        const syntheticParents = [
            { code: '01.1', name: '01.1 - Receita de Serviços', parentCode: '01' },
            { code: '01.2', name: '01.2 - Receitas de Vendas', parentCode: '01' },
            { code: '02.1', name: '02.1 - Tributos', parentCode: '02' },
            // CUSTOS OPERACIONAIS (03.1 to 03.9)
            { code: '03.1', name: '03.1 Salarios e Remuneração', parentCode: '03' },
            { code: '03.2', name: '03.2 Encargos Sociais', parentCode: '03' },
            { code: '03.3', name: '03.3 Beneficios', parentCode: '03' },
            { code: '03.4', name: '03.4 Diárias', parentCode: '03' },
            { code: '03.5', name: '03.5 SSMA', parentCode: '03' },
            { code: '03.6', name: '03.6 Materiais', parentCode: '03' },
            { code: '03.7', name: '03.7 Equipamentos', parentCode: '03' },
            { code: '03.8', name: '03.8 Comunicação/Sistema/Licenças', parentCode: '03' },
            { code: '03.9', name: '03.9 Custo com Veiculo', parentCode: '03' },
            // DESPESAS OPERACIONAIS (04.1 to 04.8)
            { code: '04.1', name: '04.1 Salarios e Remuneração', parentCode: '04' },
            { code: '04.2', name: '04.2 Encargos Sociais', parentCode: '04' },
            { code: '04.3', name: '04.3 Beneficios', parentCode: '04' },
            { code: '04.4', name: '04.4 SSMA', parentCode: '04' },
            { code: '04.5', name: '04.5 Viagens', parentCode: '04' },
            { code: '04.6', name: '04.6 Custo com Veículos', parentCode: '04' },
            { code: '04.7', name: '04.7 Cartão Corporativo', parentCode: '04' },
            { code: '04.8', name: '04.8 Serviços Terceirizados', parentCode: '04' },
            // DESPESAS ADMINISTRATIVAS (05.1 to 05.13)
            { code: '05.1', name: '05.1 Salario e Remuneração', parentCode: '05' },
            { code: '05.2', name: '05.2 Encargos Sociais', parentCode: '05' },
            { code: '05.3', name: '05.3 Beneficios', parentCode: '05' },
            { code: '05.4', name: '05.4 SSMA', parentCode: '05' },
            { code: '05.5', name: '05.5 Viagens', parentCode: '05' },
            { code: '05.6', name: '05.6 Despesa com Socios', parentCode: '05' },
            { code: '05.7', name: '05.7 Serviços Contratados', parentCode: '05' },
            { code: '05.8', name: '05.8 Despesa Comercial/Marketing', parentCode: '05' },
            { code: '05.9', name: '05.9 Despesa com Estrutura', parentCode: '05' },
            { code: '05.10', name: '05.10 Despesa Copa e Cozinha', parentCode: '05' },
            { code: '05.11', name: '05.11 Despesa com Veículos', parentCode: '05' },
            { code: '05.12', name: '05.12 Despesa de Informatica', parentCode: '05' },
            { code: '05.13', name: '05.13 Taxas e Despesas Legais', parentCode: '05' },
            // DESPESAS FINANCEIRAS (06.1 to 06.8)
            { code: '06.1', name: '06.1 Entradas Financeiras', parentCode: '06' },
            { code: '06.2', name: '06.2 Saidas Financeiras', parentCode: '06' },
            { code: '06.3', name: '06.3 Financiamento', parentCode: '06' },
            { code: '06.4', name: '06.4 Juros/Multas', parentCode: '06' },
            { code: '06.5', name: '06.5 Passivo Trabalhista', parentCode: '06' },
            { code: '06.6', name: '06.6 Depreciação', parentCode: '06' },
            { code: '06.7', name: '06.7 Cartão de Credito', parentCode: '06' },
            { code: '06.8', name: '06.8 PDD', parentCode: '06' },
        ];

        syntheticParents.forEach(synth => {
            if (!codeMap.has(synth.code)) {
                const node: CategoryNode = {
                    id: `synth-${synth.code}`,
                    name: synth.name,
                    code: synth.code,
                    children: [],
                    level: 0,
                    isSynthetic: true,
                    tenantId: ''
                };
                map.set(node.id, node);
                codeMap.set(synth.code, node);
            }
        });

        // Linking
        map.forEach(node => {
            const code = node.code || '';

            if (node.isSynthetic) {
                const synthDef = syntheticParents.find(s => s.code === code);
                if (synthDef && synthDef.parentCode) {
                    const parent = codeMap.get(synthDef.parentCode);
                    if (parent) {
                        const alreadyHas = parent.children.some(c => c.id === node.id);
                        if (!alreadyHas) {
                            parent.children.push(node);
                        }
                    }
                }
                return;
            }

            if (code.startsWith('01.1.')) {
                const parent = codeMap.get('01.1');
                if (parent) { parent.children.push(node); return; }
            }
            if (code.startsWith('01.2.')) {
                const parent = codeMap.get('01.2');
                if (parent) { parent.children.push(node); return; }
            }
            if (code.startsWith('2.1')) {
                const parent = codeMap.get('02.1');
                if (parent) { parent.children.push(node); return; }
            }

            let parentFound = false;
            if (code.includes('.')) {
                let currentPrefix = code.substring(0, code.lastIndexOf('.'));
                while (currentPrefix.length > 0) {
                    const potentialParent = Array.from(codeMap.values()).find(n => n.code === currentPrefix);
                    if (potentialParent) {
                        if (!potentialParent.children.includes(node)) {
                            potentialParent.children.push(node);
                        }
                        parentFound = true;
                        break;
                    }
                    if (!currentPrefix.includes('.')) break;
                    currentPrefix = currentPrefix.substring(0, currentPrefix.lastIndexOf('.'));
                }
            }

            if (!parentFound && code.match(/^(0[3456])\.(\d+)\./)) {
                const match = code.match(/^(0[3456])\.(\d+)/);
                if (match) {
                    const synthParentCode = match[0];
                    const synthParent = codeMap.get(synthParentCode);
                    if (synthParent) {
                        const alreadyHas = synthParent.children.some(c => c.id === node.id);
                        if (!alreadyHas) {
                            synthParent.children.push(node);
                        }
                    }
                }
            }
        });

        // Roots Retrieval
        const allChildren = new Set<string>();
        map.forEach(node => node.children.forEach(c => allChildren.add(c.id)));

        const rawRoots: CategoryNode[] = [];
        map.forEach(node => {
            if (!allChildren.has(node.id)) {
                rawRoots.push(node);
            }
        });

        // ROOT DEDUPLICATION
        const uniqueRootsMap = new Map<string, CategoryNode>();
        rawRoots.forEach(root => {
            const rootCode = root.code || root.name;
            if (uniqueRootsMap.has(rootCode)) {
                const existingRoot = uniqueRootsMap.get(rootCode)!;
                root.children.forEach(child => {
                    if (!existingRoot.children.find(c => c.id === child.id)) {
                        existingRoot.children.push(child);
                    }
                });
                if (rootCode === '01') existingRoot.name = 'RECEITAS';
                if (rootCode === '02') existingRoot.name = 'TRIBUTO SOBRE FATURAMENTO';
            } else {
                uniqueRootsMap.set(rootCode, root);
            }
        });

        const finalRoots = Array.from(uniqueRootsMap.values());

        // DEDUPLICATE CHILDREN
        map.forEach(node => {
            if (node.children.length > 0) {
                const uniqueChildren = new Map<string, CategoryNode>();
                node.children.forEach(c => uniqueChildren.set(c.id, c));
                node.children = Array.from(uniqueChildren.values());
            }
        });

        // Recalculate levels and sort
        const recalculateLevels = (nodes: CategoryNode[], lvl: number) => {
            nodes.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
            nodes.forEach(n => {
                n.level = lvl;
                recalculateLevels(n.children, lvl + 1);
            });
        };
        recalculateLevels(finalRoots, 0);

        // 3. Compute Totals Map recursively
        const totalsMap = new Map<string, { budget: number[], realized: number[] }>();
        const isNegatedCode = (code: string) => code.startsWith('06.1');

        const calculateNode = (node: CategoryNode, parentNegated = false) => {
            const negated = parentNegated || isNegatedCode(node.code || '');
            const childrenTotals = node.children.map(child => calculateNode(child, negated));
            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);

            childrenTotals.forEach(childTotal => {
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += childTotal.budget[i];
                    myRealized[i] += childTotal.realized[i];
                }
            });

            for (let i = 0; i < 12; i++) {
                const isDataPoint = !node.isSynthetic && node.children.length === 0;

                if (!node.isSynthetic && isDataPoint) {
                    const sign = negated ? -1 : 1;
                    const idsToRead = node.id.split(',');
                    let sumB = 0, sumR = 0;

                    const readNames = new Set<string>();
                    idsToRead.forEach(rawId => {
                        const cat = categories.find(c => c.id === rawId);
                        const nameToUse = cat ? cat.name : node.name;
                        const normalizedName = nameToUse.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const lookupKey = `${normalizedName}|${i}`;
                        if (!readNames.has(lookupKey)) {
                            readNames.add(lookupKey);
                            sumR += realizedValues[lookupKey] || 0;
                        }
                    });

                    const readBudgetNames = new Set<string>();
                    for (const rawId of idsToRead) {
                        const bData = budgetValues[`${rawId}-${i}`] || { amount: 0 };
                        if (bData.amount !== 0) {
                            sumB += bData.amount;
                        } else {
                            const cat = categories.find(c => c.id === rawId);
                            const nameToUse = cat ? cat.name : node.name;
                            const normalizedName = nameToUse.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            const lookupKey = `budget-${normalizedName}|${i}`;
                            if (!readBudgetNames.has(lookupKey)) {
                                readBudgetNames.add(lookupKey);
                                const nameBData = budgetValues[lookupKey] || { amount: 0 };
                                sumB += nameBData.amount;
                            }
                        }
                    }

                    myBudget[i] += sign * sumB;
                    myRealized[i] += sign * sumR;
                }
            }

            const finalNodeTotals = { budget: myBudget, realized: myRealized };
            totalsMap.set(node.id, finalNodeTotals);
            node.id.split(',').forEach(id => {
                totalsMap.set(id, finalNodeTotals);
            });
            return finalNodeTotals;
        };

        finalRoots.forEach(root => calculateNode(root));
        const potentialRoots = finalRoots;

        // 4. Helper to get DRE Totals
        const getDreTotalsForMonth = (m: number) => {
            const sumGroup = (predicate: (node: CategoryNode) => boolean, type: 'budget' | 'realized') => {
                const roots = potentialRoots.filter(predicate);
                return roots.reduce((acc, root) => {
                    const total = totalsMap.get(root.id);
                    return acc + (total ? total[type][m] : 0);
                }, 0);
            };

            const bRev = sumGroup(r => (r.code || '').startsWith('01') || (r.code || '') === '1', 'budget');
            const rRev = sumGroup(r => (r.code || '').startsWith('01') || (r.code || '') === '1', 'realized');

            const bTaxes = sumGroup(r => (r.code || '').startsWith('02') || (r.code || '') === '2', 'budget');
            const rTaxes = sumGroup(r => (r.code || '').startsWith('02') || (r.code || '') === '2', 'realized');

            const bRecLiq = bRev - bTaxes;
            const rRecLiq = rRev - rTaxes;

            const bCosts = sumGroup(r => (r.code || '').startsWith('3') || (r.code || '').startsWith('03'), 'budget');
            const rCosts = sumGroup(r => (r.code || '').startsWith('3') || (r.code || '').startsWith('03'), 'realized');

            const bGrossMarg = bRecLiq - bCosts;
            const rGrossMarg = rRecLiq - rCosts;

            const bOpExp = sumGroup(r => (r.code || '').startsWith('4') || (r.code || '').startsWith('04'), 'budget');
            const rOpExp = sumGroup(r => (r.code || '').startsWith('4') || (r.code || '').startsWith('04'), 'realized');

            const bContribMarg = bGrossMarg - bOpExp;
            const rContribMarg = rGrossMarg - rOpExp;

            const bAdminExp = sumGroup(r => (r.code || '').startsWith('5') || (r.code || '').startsWith('05') || (r.code || '').startsWith('7') || (r.code || '').startsWith('07') || (r.code || '').startsWith('8') || (r.code || '').startsWith('08'), 'budget');
            const rAdminExp = sumGroup(r => (r.code || '').startsWith('5') || (r.code || '').startsWith('05') || (r.code || '').startsWith('7') || (r.code || '').startsWith('07') || (r.code || '').startsWith('8') || (r.code || '').startsWith('08'), 'realized');

            const bEbitda = bContribMarg - bAdminExp;
            const rEbitda = rContribMarg - rAdminExp;

            const bFin = sumGroup(r => (r.code || '').startsWith('6') || (r.code || '').startsWith('06') || (r.code || '').startsWith('9') || (r.code || '').startsWith('09') || (r.code || '').startsWith('10'), 'budget');
            const rFin = sumGroup(r => (r.code || '').startsWith('6') || (r.code || '').startsWith('06') || (r.code || '').startsWith('9') || (r.code || '').startsWith('09') || (r.code || '').startsWith('10'), 'realized');

            const bNetProfit = bEbitda - bFin;
            const rNetProfit = rEbitda - rFin;

            return {
                vRev: { b: bRev, r: rRev },
                vTaxes: { b: bTaxes, r: rTaxes },
                vRecLiq: { b: bRecLiq, r: rRecLiq },
                vCosts: { b: bCosts, r: rCosts },
                vGrossMarg: { b: bGrossMarg, r: rGrossMarg },
                vOpExp: { b: bOpExp, r: rOpExp },
                vContribMarg: { b: bContribMarg, r: rContribMarg },
                vAdminExp: { b: bAdminExp, r: rAdminExp },
                vEbitda: { b: bEbitda, r: rEbitda },
                vFin: { b: bFin, r: rFin },
                vNetProfit: { b: bNetProfit, r: rNetProfit }
            };
        };

        // Precompute DRE Totals for all 12 months for Revenue-base / Indicator logic
        const dreTotals = Array.from({ length: 12 }, (_, i) => getDreTotalsForMonth(i));

        // 5. Build final series
        const keys = categoryId.split(',').map(k => k.trim()).filter(Boolean);

        // Fetch original categories for UUID keys that are not DRE keys
        const dbKeys = keys.filter(k => !['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(k));
        const originalCategories = dbKeys.length > 0 ? await prisma.category.findMany({
            where: { id: { in: dbKeys } }
        }) : [];

        // Map any UUID from another tenant to the corresponding UUID in the current targets
        const resolvedKeys = keys.map(key => {
            const isDreKey = ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(key);
            if (isDreKey) return key;
            if (totalsMap.has(key)) return key;

            const origCat = originalCategories.find(c => c.id === key);
            if (!origCat) return key;

            const cleanCode = (origCat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
            const origNormName = normalize(origCat.name);

            if (cleanCode) {
                const match = categories.find(c => {
                    const cCode = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                    return cCode === cleanCode;
                });
                if (match) return match.id;
            }

            const matchByName = categories.find(c => normalize(c.name) === origNormName);
            if (matchByName) return matchByName.id;

            return key;
        });

        const series = Array.from({ length: 12 }, (_, m) => {
            let budgetVal = 0;
            let realizedVal = 0;
            const breakdown: Record<string, { budget: number; realized: number; atingido: number; pctOfRevenue: number }> = {};
            const addedCanonicalKeys = new Set<string>();

            resolvedKeys.forEach((key, idx) => {
                const originalKey = keys[idx];
                const isDreKey = ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(key);

                let canonicalKey = key;
                if (!isDreKey) {
                    const node = map.get(key);
                    if (node) {
                        canonicalKey = node.id;
                    }
                }

                let bVal = 0;
                let rVal = 0;

                if (isDreKey) {
                    const dreKey = key as keyof typeof dreTotals[0];
                    bVal = dreTotals[m][dreKey].b;
                    rVal = dreTotals[m][dreKey].r;
                } else {
                    const t = totalsMap.get(key);
                    if (t) {
                        bVal = t.budget[m];
                        rVal = t.realized[m];
                    } else {
                        const node = codeMap.get(key);
                        if (node) {
                            const tNode = totalsMap.get(node.id);
                            if (tNode) {
                                bVal = tNode.budget[m];
                                rVal = tNode.realized[m];
                            }
                        }
                    }
                }

                if (!addedCanonicalKeys.has(canonicalKey)) {
                    addedCanonicalKeys.add(canonicalKey);
                    budgetVal += bVal;
                    realizedVal += rVal;
                }

                // Individual account target achievement percentage
                let at = 0;
                if (bVal > 0) {
                    at = (rVal / bVal) * 100;
                } else if (bVal < 0) {
                    at = (1 + (bVal - rVal) / bVal) * 100;
                } else {
                    at = rVal >= 0 ? 100 : 0;
                }

                // Individual percentage of revenue
                const revVal = dreTotals[m].vRev.r || 1;
                const pct = (rVal / revVal) * 100;

                breakdown[originalKey] = {
                    budget: bVal,
                    realized: rVal,
                    atingido: at,
                    pctOfRevenue: pct
                };
            });

            // Target achievement percentage (atingido)
            let atingido = 0;
            if (budgetVal > 0) {
                atingido = (realizedVal / budgetVal) * 100;
            } else if (budgetVal < 0) {
                atingido = (1 + (budgetVal - realizedVal) / budgetVal) * 100;
            } else {
                atingido = realizedVal >= 0 ? 100 : 0;
            }

            // Percentage of revenue (pctOfRevenue)
            const revenueVal = dreTotals[m].vRev.r || 1;
            const pctOfRevenue = (realizedVal / revenueVal) * 100;

            return {
                month: m + 1,
                budget: budgetVal,
                realized: realizedVal,
                atingido,
                pctOfRevenue,
                breakdown
            };
        });

        return NextResponse.json({ success: true, data: series });
    } catch (e: any) {
        console.error('[API DETAILED CHART DATA] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
