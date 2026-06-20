import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const jvsTrat = tenants.find(t => t.name.toUpperCase().includes('TRATMENTOS') || t.name.toUpperCase().includes('TRATAMENTOS'));
        
        let simulation: any = {};

        if (jvsTrat) {
            const categories = await prisma.category.findMany({
                orderBy: { name: 'asc' }
            });
            const isRevenueCategory = (name: string) => {
                const cleanCode = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                return cleanCode.startsWith('01') || cleanCode === '1';
            };
            const revenueCategories = categories.filter(c => isRevenueCategory(c.name));
            const compRevCategories = revenueCategories.filter(c => c.tenantId === jvsTrat.id);

            // Compute realizedValues like /api/sync
            const realizedRaw = await prisma.realizedEntry.findMany({
                where: { tenantId: jvsTrat.id, year: 2026, viewMode: 'competencia' }
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

            const realizedValues: Record<string, number> = {};
            realizedEntries.forEach(e => {
                const idKey = `realized-${e.categoryId}-${e.month - 1}`;
                realizedValues[idKey] = (realizedValues[idKey] || 0) + e.amount;
            });

            // Simulate the lookup
            const lookups: any[] = [];
            let totalRealized = 0;
            compRevCategories.forEach(cat => {
                for (let m = 0; m <= 11; m++) {
                    const lookupKey = `realized-${cat.id}-${m}`;
                    const val = realizedValues[lookupKey] || 0;
                    if (val > 0) {
                        totalRealized += val;
                        lookups.push({
                            catId: cat.id,
                            catName: cat.name,
                            month: m,
                            lookupKey,
                            val
                        });
                    }
                }
            });

            simulation = {
                compRevCategoriesCount: compRevCategories.length,
                compRevCategories: compRevCategories.map(c => ({ id: c.id, name: c.name })),
                realizedValuesKeysCount: Object.keys(realizedValues).length,
                realizedValuesKeysSample: Object.keys(realizedValues).slice(0, 15),
                lookupsMatched: lookups,
                totalRealized
            };
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            simulation
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
