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
        
        let stats: any = {};

        if (jvsTrat) {
            const categories = await prisma.category.findMany({
                where: { tenantId: jvsTrat.id }
            });
            const isRevenueCategory = (name: string) => {
                const cleanCode = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                return cleanCode.startsWith('01') || cleanCode === '1';
            };
            const revenueCategoryIds = categories
                .filter(c => isRevenueCategory(c.name))
                .map(c => c.id);

            const allRealized = await prisma.realizedEntry.findMany({
                where: { tenantId: jvsTrat.id, year: 2026 }
            });

            const matchedRealized = allRealized.filter(r => revenueCategoryIds.includes(r.categoryId));
            
            const totalMatched = matchedRealized.length;
            const syncedMatched = matchedRealized.filter(r => r.externalId && r.externalId.startsWith('sync-')).length;
            const nonSyncedMatched = matchedRealized.filter(r => !r.externalId || !r.externalId.startsWith('sync-')).length;

            const syncedMonths = new Set<string>();
            allRealized.forEach(e => {
                if (e.externalId && e.externalId.startsWith('sync-')) {
                    syncedMonths.add(`${e.year}|${e.month}`);
                }
            });

            // Count how many matched realized entries remain after deduplication filter
            const deduplicatedMatched = matchedRealized.filter(e => {
                const key = `${e.year}|${e.month}`;
                if (syncedMonths.has(key)) {
                    return e.externalId && e.externalId.startsWith('sync-');
                }
                return true;
            });

            stats = {
                totalMatched,
                syncedMatched,
                nonSyncedMatched,
                deduplicatedMatchedCount: deduplicatedMatched.length,
                syncedMonths: Array.from(syncedMonths),
                sampleDeduplicatedMatched: deduplicatedMatched.slice(0, 5)
            };
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            stats
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
