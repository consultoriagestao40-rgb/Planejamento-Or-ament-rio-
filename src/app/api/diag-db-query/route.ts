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
        
        let revenueCategoryIds: string[] = [];
        let totalRealizedCount = 0;
        let matchedRealizedCount = 0;
        let sampleMatchedEntry = null;

        if (jvsTrat) {
            const categories = await prisma.category.findMany({
                where: { tenantId: jvsTrat.id }
            });
            const isRevenueCategory = (name: string) => {
                const cleanCode = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                return cleanCode.startsWith('01') || cleanCode === '1';
            };
            revenueCategoryIds = categories
                .filter(c => isRevenueCategory(c.name))
                .map(c => c.id);

            const allRealized = await prisma.realizedEntry.findMany({
                where: { tenantId: jvsTrat.id, year: 2026 }
            });
            totalRealizedCount = allRealized.length;

            const matchedRealized = allRealized.filter(r => revenueCategoryIds.includes(r.categoryId));
            matchedRealizedCount = matchedRealized.length;
            if (matchedRealizedCount > 0) {
                sampleMatchedEntry = matchedRealized[0];
            }
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            revenueCategoryIds,
            totalRealizedCount,
            matchedRealizedCount,
            sampleMatchedEntry
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
