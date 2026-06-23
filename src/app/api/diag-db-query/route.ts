import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

import { getAllVariantIds } from '@/lib/tenant-utils';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true } });
        
        // Let's resolve the targets for ALL tenants
        let targetTenantIds = tenants.map(t => t.id);

        const [realizedRaw, budgetRaw] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: { tenantId: { in: targetTenantIds }, year: 2026, viewMode: 'competencia' },
                include: { category: true }
            }),
            prisma.budgetEntry.findMany({
                where: { tenantId: { in: targetTenantIds }, year: 2026 },
                include: { category: true }
            })
        ]);

        const categories = await prisma.category.findMany();
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

        // ------------------ LOGIC A: DRE SYNC API ------------------
        const syncValues: Record<string, number> = {};
        
        // filter realized sync API
        const syncedMonths = new Set<string>();
        realizedRaw.forEach(e => {
            if (e.externalId && e.externalId.startsWith('sync-')) {
                syncedMonths.add(`${e.year}|${e.month}`);
            }
        });

        const syncRealizedEntries = realizedRaw.filter(e => {
            const key = `${e.year}|${e.month}`;
            if (syncedMonths.has(key)) {
                return e.externalId && e.externalId.startsWith('sync-');
            }
            return true;
        });

        const cleanSyncRealized = syncRealizedEntries.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const match = catName.match(/^(\d{1,2}(?:\.\d+)*)/);
            const code = match ? match[1] : '';
            if (code === '06.1.2' || code === '06.2.2') return false;
            return true;
        });

        const cleanSyncBudget = budgetRaw.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const match = catName.match(/^(\d{1,2}(?:\.\d+)*)/);
            const code = match ? match[1] : '';
            if (code === '06.1.2' || code === '06.2.2') return false;
            return true;
        });

        cleanSyncRealized.forEach(e => {
            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `${normalizedName}|${e.month - 1}`;
                syncValues[nameKey] = (syncValues[nameKey] || 0) + e.amount;

                const isRevenue = normalizedName.startsWith('01');
                if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                    const parentKey = `01RECEITABRUTA|${e.month - 1}`;
                    syncValues[parentKey] = (syncValues[parentKey] || 0) + e.amount;
                }
            }
        });

        cleanSyncBudget.forEach(e => {
            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `budget-${normalizedName}|${e.month - 1}`;
                syncValues[nameKey] = (syncValues[nameKey] || 0) + e.amount;

                const isRevenue = normalizedName.startsWith('01');
                if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                    const parentKey = `budget-01RECEITABRUTA|${e.month - 1}`;
                    syncValues[parentKey] = (syncValues[parentKey] || 0) + e.amount;
                }
            }
        });

        const dreRevRealized: number[] = [];
        const dreRevBudget: number[] = [];
        for (let m = 0; m < 12; m++) {
            dreRevRealized.push(syncValues[`01RECEITABRUTA|${m}`] || 0);
            dreRevBudget.push(syncValues[`budget-01RECEITABRUTA|${m}`] || 0);
        }

        // ------------------ LOGIC B: DETAILED CHART API ------------------
        // Build variant tenant groups
        const tenantToGroup = new Map<string, string>();
        tenants.forEach(t => {
            const cnpjClean = (t.cnpj || '').replace(/\D/g, '');
            const isUnknown = !t.cnpj || t.cnpj.toLowerCase().includes('unknown') || cnpjClean === '';
            const groupKey = (!isUnknown && cnpjClean.length >= 8)
                ? cnpjClean.substring(0, 8)
                : (t.name || t.id).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/LTDA$/, '').replace(/SA$/, '');
            tenantToGroup.set(t.id, groupKey);
        });

        const normalizeCCNameDedup = (name: string) =>
            (name || '')
                .toLowerCase()
                .replace(/^\[inativo\]\s*/i, '')
                .replace(/^[\d. ]+-?\s*/, '')
                .replace(/[^a-z0-9]/g, '')
                .trim();

        // realized dedup (detailed chart logic)
        const realizedDedupMap = new Map<string, any>();
        realizedRaw.forEach(e => {
            const catName = (e as any).category?.name || '';
            const normName = catName.toUpperCase().replace(/[^A-Z0-9.]/g, '');
            const group = tenantToGroup.get(e.tenantId) || e.tenantId;
            const ccNorm = normalizeCCNameDedup((e as any).costCenter?.name || '');
            const key = `${normName}|${e.month}|${group}|${ccNorm}`;
            const existing = realizedDedupMap.get(key);
            const isSync = !!(e.externalId && e.externalId.startsWith('sync-'));
            if (!existing) {
                realizedDedupMap.set(key, { ...e, _isSync: isSync });
            } else if (isSync && !existing._isSync) {
                realizedDedupMap.set(key, { ...e, _isSync: true });
            }
        });
        const chartRealizedEntries = Array.from(realizedDedupMap.values());

        // budget dedup (detailed chart logic)
        const budgetDedupMap = new Map<string, any>();
        budgetRaw.forEach(e => {
            const catName = (e as any).category?.name || '';
            const normName = catName.toUpperCase().replace(/[^A-Z0-9.]/g, '');
            const group = tenantToGroup.get(e.tenantId) || e.tenantId;
            const ccNorm = normalizeCCNameDedup((e as any).costCenter?.name || '');
            const key = `${normName}|${e.month}|${group}|${ccNorm}`;
            if (!budgetDedupMap.has(key)) {
                budgetDedupMap.set(key, { ...e });
            }
        });
        const chartBudgetEntries = Array.from(budgetDedupMap.values());

        const getCleanCode = (name: string) => {
            const match = name.match(/^(\d{1,2}(?:\.\d+)*)/); 
            return match ? match[1] : '';
        };

        const normalizeCode = (code: string): string => {
            if (!code) return '';
            return code.split('.').map(part => part.replace(/^0+/, '') || '0').join('.');
        };

        // Filter categories like 6.1.2 or 6.2.2
        const isConsolidated = true;
        const chartRealizedFiltered = chartRealizedEntries.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const code = normalizeCode(getCleanCode(catName));
            if (code === '6.1.2' || code === '6.2.2') return false;
            if (isConsolidated && (code === '6.1.1' || code === '6.2.1')) return false;
            return true;
        });

        const chartBudgetFiltered = chartBudgetEntries.filter(e => {
            const catName = categoryNameMap.get(e.categoryId) || '';
            const code = normalizeCode(getCleanCode(catName));
            if (code === '6.1.2' || code === '6.2.2') return false;
            if (isConsolidated && (code === '6.1.1' || code === '6.2.1')) return false;
            return true;
        });

        const chartRealizedValues: Record<string, number> = {};
        const chartBudgetValues: Record<string, { amount: number }> = {};

        chartRealizedFiltered.forEach((e: any) => {
            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `${normalizedName}|${e.month - 1}`;
                chartRealizedValues[nameKey] = (chartRealizedValues[nameKey] || 0) + e.amount;

                const isRevenue = normalizedName.startsWith('01') || normalizedName.startsWith('1RECEIT');
                if (isRevenue && normalizedName !== '01RECEITABRUTA' && normalizedName !== '1RECEITABRUTA') {
                    chartRealizedValues[`01RECEITABRUTA|${e.month - 1}`] = (chartRealizedValues[`01RECEITABRUTA|${e.month - 1}`] || 0) + e.amount;
                    chartRealizedValues[`1RECEITABRUTA|${e.month - 1}`] = (chartRealizedValues[`1RECEITABRUTA|${e.month - 1}`] || 0) + e.amount;
                }
            }
        });

        chartBudgetFiltered.forEach((e: any) => {
            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `budget-${normalizedName}|${e.month - 1}`;
                chartBudgetValues[nameKey] = { amount: (chartBudgetValues[nameKey]?.amount || 0) + e.amount };

                const isRevenue = normalizedName.startsWith('01') || normalizedName.startsWith('1RECEIT');
                if (isRevenue && normalizedName !== '01RECEITABRUTA' && normalizedName !== '1RECEITABRUTA') {
                    chartBudgetValues[`budget-01RECEITABRUTA|${e.month - 1}`] = { amount: (chartBudgetValues[`budget-01RECEITABRUTA|${e.month - 1}`]?.amount || 0) + e.amount };
                    chartBudgetValues[`budget-1RECEITABRUTA|${e.month - 1}`] = { amount: (chartBudgetValues[`budget-1RECEITABRUTA|${e.month - 1}`]?.amount || 0) + e.amount };
                }
            }
        });

        // Simula a árvore do chart
        interface CategoryNode {
            id: string;
            name: string;
            code: string;
            children: CategoryNode[];
            level: number;
            isSynthetic: boolean;
            tenantId: string;
        }

        const map = new Map<string, CategoryNode>();
        const codeMap = new Map<string, CategoryNode>();
        const nameMap = new Map<string, CategoryNode>();

        categories.forEach((cat: any) => {
            const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            const normCode = normalizeCode(cleanCode);
            const uniqueKey = `${cat.type}|${normCode || cat.name.trim()}`;

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
                code: normCode,
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
            if (normCode) {
                codeMap.set(normCode, node);
            }
        });

        // Add 1 and 1.1 synthetics
        const syntheticParents = [
            { code: '1.1', name: '01.1 - Receita de Serviços', parentCode: '1' },
            { code: '1.2', name: '01.2 - Receitas de Vendas', parentCode: '1' }
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
                        if (!alreadyHas) parent.children.push(node);
                    }
                }
                return;
            }

            if (code.startsWith('1.1.')) {
                const parent = codeMap.get('1.1');
                if (parent) parent.children.push(node);
            }
            if (code.startsWith('1.2.')) {
                const parent = codeMap.get('1.2');
                if (parent) parent.children.push(node);
            }
        });

        // Roots
        const allChildren = new Set<string>();
        map.forEach(node => node.children.forEach(c => allChildren.add(c.id)));
        const rawRoots: CategoryNode[] = [];
        map.forEach(node => {
            if (!allChildren.has(node.id)) rawRoots.push(node);
        });

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
            } else {
                uniqueRootsMap.set(rootCode, root);
            }
        });

        const finalRoots = Array.from(uniqueRootsMap.values());
        const root1 = finalRoots.find(r => r.code === '1');

        const totalsMap = new Map<string, { budget: number[], realized: number[] }>();

        const calculateNode = (node: CategoryNode) => {
            const childrenTotals = node.children.map(child => calculateNode(child));
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
                            sumR += chartRealizedValues[lookupKey] || 0;
                        }
                    });

                    const readBudgetNames = new Set<string>();
                    for (const rawId of idsToRead) {
                        const cat = categories.find(c => c.id === rawId);
                        const nameToUse = cat ? cat.name : node.name;
                        const normalizedName = nameToUse.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const lookupKey = `budget-${normalizedName}|${i}`;
                        if (!readBudgetNames.has(lookupKey)) {
                            readBudgetNames.add(lookupKey);
                            sumB += (chartBudgetValues[lookupKey]?.amount || 0);
                        }
                    }

                    myBudget[i] += sumB;
                    myRealized[i] += sumR;
                }
            }

            const finalNodeTotals = { budget: myBudget, realized: myRealized };
            totalsMap.set(node.id, finalNodeTotals);
            return finalNodeTotals;
        };

        if (root1) calculateNode(root1);
        const chartRevTotals = root1 ? totalsMap.get(root1.id) : null;

        // Compare side by side
        const comparison: any[] = [];
        for (let m = 0; m < 12; m++) {
            comparison.push({
                month: m + 1,
                dre_realized: dreRevRealized[m],
                dre_budget: dreRevBudget[m],
                chart_realized: chartRevTotals ? chartRevTotals.realized[m] : 0,
                chart_budget: chartRevTotals ? chartRevTotals.budget[m] : 0
            });
        }

        // Detailed dump for Month 1 and 2
        const detailedBudget = budgetRaw.filter(e => e.month === 1 || e.month === 2 || e.month === 0).map(e => ({
            tenant: tenants.find(t => t.id === e.tenantId)?.name,
            category: categoryNameMap.get(e.categoryId),
            month: e.month,
            amount: e.amount,
            cc: (e as any).costCenter?.name || 'SEM CC'
        })).slice(0, 50);

        const detailedRealized = realizedRaw.filter(e => e.month === 1 || e.month === 2 || e.month === 0).map(e => ({
            tenant: tenants.find(t => t.id === e.tenantId)?.name,
            category: categoryNameMap.get(e.categoryId),
            month: e.month,
            amount: e.amount,
            externalId: e.externalId,
            cc: (e as any).costCenter?.name || 'SEM CC'
        })).slice(0, 50);

        return NextResponse.json({
            success: true,
            comparison,
            syncedMonths: Array.from(syncedMonths),
            detailedBudget,
            detailedRealized
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
