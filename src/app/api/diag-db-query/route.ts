import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
        const year = 2026;
        const viewMode = 'competencia';

        // 1. Variante IDs
        const { getAllVariantIds } = await import('@/lib/tenant-utils');
        const allVariantIds = await getAllVariantIds(tenantId);

        // 2. Fetch realized e budget
        const [realizedRaw, budgetRaw] = await Promise.all([
            prisma.realizedEntry.findMany({
                where: { tenantId: { in: allVariantIds }, year, viewMode },
                include: { category: true }
            }),
            prisma.budgetEntry.findMany({
                where: { tenantId: { in: allVariantIds }, year },
                include: { category: true }
            })
        ]);

        // 3. Aplicar a mesma lógica de desduplicação do sync/route.ts
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

        // 4. Mapear nomes de categorias
        const categories = await prisma.category.findMany({
            select: { id: true, name: true }
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

        // 5. Agregação
        const values: Record<string, number> = {};
        realizedEntries.forEach((e: any) => {
            // Name-based key for Dashboard (DRE)
            let catName = categoryNameMap.get(e.categoryId);
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }

            if (catName) {
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const nameKey = `${normalizedName}|${e.month - 1}`;
                values[nameKey] = (values[nameKey] || 0) + e.amount;
                
                // Aggregator for Revenue
                const isRevenue = normalizedName.startsWith('01');
                if (isRevenue && normalizedName !== '01RECEITABRUTA') {
                    const parentKey = `01RECEITABRUTA|${e.month - 1}`;
                    values[parentKey] = (values[parentKey] || 0) + e.amount;
                }
            }
        });

        return NextResponse.json({
            success: true,
            tenantId,
            allVariantIds,
            realizedRawCount: realizedRaw.length,
            realizedEntriesCount: realizedEntries.length,
            syncedMonthsCount: syncedMonths.size,
            syncedMonths: Array.from(syncedMonths),
            valuesForMay: Object.fromEntries(
                Object.entries(values).filter(([k]) => k.endsWith('|4'))
            )
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
