import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const year = 2026;
        const countRealized = await prisma.realizedEntry.count({ where: { year } });
        const countCategories = await prisma.category.count();
        const firstEntries = await prisma.realizedEntry.findMany({ 
            where: { year },
            take: 3,
            select: { categoryId: true, amount: true, tenantId: true, month: true }
        });

        const checkCats = await Promise.all(firstEntries.map(async (e) => {
            const cat = await prisma.category.findUnique({ where: { id: e.categoryId } });
            return {
                categoryId: e.categoryId,
                amount: e.amount,
                found: !!cat,
                catName: cat?.name || 'NOT FOUND'
            };
        }));

        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

        return NextResponse.json({
            success: true,
            year,
            database: {
                realizedCount: countRealized,
                categoriesCount: countCategories,
                tenants: tenants.map(t => ({ id: t.id, name: t.name })),
                sampleIntegrity: checkCats
            },
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
