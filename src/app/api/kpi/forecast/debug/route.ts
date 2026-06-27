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
                    tenantId: tenant.id,
                    name: { startsWith: '01' }
                }
            });

            const entries = await prisma.realizedEntry.findMany({
                where: {
                    tenantId: tenant.id,
                    year: 2026,
                    month: 1, // Jan
                    viewMode: 'competencia'
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
                categoriesCount: categories.length,
                entriesCount: entries.length,
                totalRealizedJan: entries.reduce((sum, e) => sum + e.amount, 0),
                entries: entries.map(e => ({
                    categoryId: e.categoryId,
                    categoryName: e.category.name,
                    amount: e.amount,
                    viewMode: e.viewMode
                }))
            });
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
