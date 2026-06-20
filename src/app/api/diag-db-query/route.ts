import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        let jvsFac = tenants.find(t => t.name.toUpperCase().includes('JVS') && t.name.toUpperCase().includes('FACILITIES'));
        if (!jvsFac) {
            jvsFac = tenants.find(t => t.name.toUpperCase().includes('JVS'));
        }
        if (!jvsFac) {
            return NextResponse.json({ success: true, error: 'JVS FACILITIES tenant not found', tenants });
        }

        // 1. Simular a agregação de realizedValues para JVS FACILITIES (igual ao sync API)
        const realizedRaw = await prisma.realizedEntry.findMany({
            where: { tenantId: jvsFac.id, year: 2026, viewMode: 'competencia' }
        });

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

        const realizedValues: Record<string, number> = {};
        realizedEntries.forEach(e => {
            // ID-based keys
            const idKey = `realized-${e.categoryId}-${e.month - 1}`;
            realizedValues[idKey] = (realizedValues[idKey] || 0) + e.amount;

            // Name-based keys (usado pelo DRE)
            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }
            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `${normalizedName}|${e.month - 1}`;
                realizedValues[nameKey] = (realizedValues[nameKey] || 0) + e.amount;

                const isRevenue = normalizedName.startsWith('01');
                if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                    const parentKey = `01RECEITABRUTA|${e.month - 1}`;
                    realizedValues[parentKey] = (realizedValues[parentKey] || 0) + e.amount;
                }
            }
        });

        // 2. Simular o cálculo do DRE para JVS FACILITIES (Name-based)
        const getMonthlyDREValue = (catNamePrefix: string, monthIdx: number) => {
            let sum = 0;
            const relevantCats = categories.filter(c => c.tenantId === jvsFac.id && c.name.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith(catNamePrefix));
            relevantCats.forEach(c => {
                const normalizedName = c.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const key = `${normalizedName}|${monthIdx}`;
                sum += realizedValues[key] || 0;
            });
            return sum;
        };

        const dreMonthlyMB: number[] = [];
        let dreAccumulatedMB = 0;
        const dreMonthlyDetails: any[] = [];
        for (let m = 0; m <= 5; m++) {
            const rev = getMonthlyDREValue('01', m);
            const tax = getMonthlyDREValue('02', m);
            const cost = getMonthlyDREValue('03', m);
            const mb = rev - tax - cost;
            dreMonthlyMB.push(mb);
            dreAccumulatedMB += mb;
            dreMonthlyDetails.push({ month: m + 1, rev, tax, cost, mb });
        }

        // 3. Detailed breakdown of JVS Facilities categories
        const isRev = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('01') || code === '1';
        };
        const isTax = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('02') || code === '2';
        };
        const isCost = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('3') || code.startsWith('03');
        };

        const tenantCategories = categories.filter((c: any) => c.tenantId === jvsFac.id);
        const breakdown = tenantCategories.map(cat => {
            const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
            let idSum = 0;
            for (let m = 0; m <= 5; m++) {
                idSum += (realizedValues[`realized-${cat.id}-${m}`] || 0);
                if (cleanId !== cat.id) {
                    idSum += (realizedValues[`realized-${cleanId}-${m}`] || 0);
                }
            }

            const normalizedName = cat.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
            let nameSum = 0;
            for (let m = 0; m <= 5; m++) {
                nameSum += (realizedValues[`${normalizedName}|${m}`] || 0);
            }

            return {
                id: cat.id,
                name: cat.name,
                isRevenue: isRev(cat),
                isTaxes: isTax(cat),
                isCosts: isCost(cat),
                idSum: idSum / 1000,
                nameSum: nameSum / 1000
            };
        }).filter(item => item.idSum !== 0 || item.nameSum !== 0);

        const addedKeys = new Set<string>();
        let totalRev = 0;
        let totalTax = 0;
        let totalCost = 0;

        for (let m = 0; m <= 5; m++) {
            tenantCategories.forEach(cat => {
                const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                const k1 = `realized-${cat.id}-${m}`;
                const k2 = `realized-${cleanId}-${m}`;
                if (isRev(cat)) {
                    if (!addedKeys.has(k1)) { addedKeys.add(k1); totalRev += (realizedValues[k1] || 0); }
                    if (!addedKeys.has(k2)) { addedKeys.add(k2); totalRev += (realizedValues[k2] || 0); }
                }
                if (isTax(cat)) {
                    if (!addedKeys.has(k1)) { addedKeys.add(k1); totalTax += (realizedValues[k1] || 0); }
                    if (!addedKeys.has(k2)) { addedKeys.add(k2); totalTax += (realizedValues[k2] || 0); }
                }
                if (isCost(cat)) {
                    if (!addedKeys.has(k1)) { addedKeys.add(k1); totalCost += (realizedValues[k1] || 0); }
                    if (!addedKeys.has(k2)) { addedKeys.add(k2); totalCost += (realizedValues[k2] || 0); }
                }
            });
        }
        totalRev = totalRev / 1000;
        totalTax = totalTax / 1000;
        totalCost = totalCost / 1000;

        const rawSalariesEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: jvsFac.id,
                year: 2026,
                viewMode: 'competencia',
                categoryId: { in: ['0f74ee3e-ed1e-4df8-9672-270873dc22b9', 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9'] }
            },
            select: {
                id: true,
                categoryId: true,
                amount: true,
                externalId: true,
                month: true,
                description: true
            }
        });
        const calculatedMB = totalRev - totalTax - totalCost;

        return NextResponse.json({
            success: true,
            jvsFac,
            dreMonthlyDetails,
            dreAccumulatedMB: dreAccumulatedMB / 1000,
            calculatedMB,
            totalRev,
            totalTax,
            totalCost,
            rawSalariesEntries,
            breakdown
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
