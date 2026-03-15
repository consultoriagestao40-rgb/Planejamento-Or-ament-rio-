import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        if (!spot) return NextResponse.json({ error: 'SPOT not found' });

        const cats = await prisma.category.findMany({
            where: { tenantId: spot.id },
            select: { id: true, name: true }
        });

        const realized = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id },
            take: 20
        });

        const count2026Caixa = await prisma.realizedEntry.count({
            where: { tenantId: spot.id, year: 2026, viewMode: 'caixa' }
        });

        return NextResponse.json({
            tenant: spot,
            categoriesCount: cats.length,
            categoriesSample: cats.slice(0, 10),
            realizedSample: realized,
            count2026Caixa
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
