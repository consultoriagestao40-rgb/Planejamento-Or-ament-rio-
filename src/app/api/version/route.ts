import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        
        const results = [];
        for (const tenant of tenants) {
            const categories = await prisma.category.findMany({
                where: {
                    tenantId: tenant.id
                }
            });
            const parentIds = new Set(categories.map(c => c.parentId).filter(Boolean));
            const leafCategories = categories.filter(c => !parentIds.has(c.id));

            // Realized entries for Jan 2026 under '01'
            const revLeafIds = leafCategories
                .filter(c => c.name.startsWith('01') || c.name.startsWith('1.'))
                .map(c => c.id);

            const entries = await prisma.realizedEntry.findMany({
                where: {
                    tenantId: tenant.id,
                    year: 2026,
                    month: 1, // Jan
                    viewMode: 'competencia',
                    categoryId: { in: revLeafIds }
                },
                include: {
                    category: {
                        select: { name: true, type: true }
                    }
                }
            });

            results.push({
                tenant: tenant.name,
                tenantId: tenant.id,
                totalLeafCategories: leafCategories.length,
                totalRevenueLeafCategories: revLeafIds.length,
                totalRealizedJanRevenue: entries.reduce((sum, e) => sum + e.amount, 0),
                entries: entries.map(e => ({
                    categoryId: e.categoryId,
                    categoryName: e.category.name,
                    amount: e.amount,
                    viewMode: e.viewMode,
                    externalId: e.externalId
                }))
            });
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
