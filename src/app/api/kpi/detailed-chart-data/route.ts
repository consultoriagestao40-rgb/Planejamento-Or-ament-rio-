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
        const realizedEntries = realizedRaw.filter(e => {
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

        budgetRaw.forEach((e: any) => {
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
        const potentialRoots: CategoryNode[] = [];
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
            }
        });

        map.forEach((node) => {
            if (!node.code) {
                potentialRoots.push(node);
                return;
            }
            const parts = node.code.split('.');
            if (parts.length === 1) {
                potentialRoots.push(node);
                return;
            }
            let parentCode = parts.slice(0, -1).join('.');
            let parentNode = codeMap.get(parentCode);
            if (!parentNode && parts.length > 2) {
                parentCode = parts.slice(0, -2).join('.');
                parentNode = codeMap.get(parentCode);
            }
            if (parentNode) {
                parentNode.children.push(node);
                node.level = parentNode.level + 1;
            } else {
                potentialRoots.push(node);
            }
        });

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
                const isDataPoint = node.children.length === 0;

                if (isDataPoint) {
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

                    for (const rawId of idsToRead) {
                        const bData = budgetValues[`${rawId}-${i}`] || { amount: 0 };
                        sumB += bData.amount;
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

        potentialRoots.forEach(root => calculateNode(root));

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

            resolvedKeys.forEach((key, idx) => {
                const originalKey = keys[idx];
                const isDreKey = ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(key);

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

                budgetVal += bVal;
                realizedVal += rVal;

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
