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

        const ccs = await prisma.costCenter.findMany({
            where: { tenantId: spot.id },
            select: { id: true, name: true }
        });

        const variants = await prisma.tenant.findMany({
            where: { OR: [ { name: { contains: 'SPOT' } }, { id: spot.id } ] }
        });

        return NextResponse.json({
            tenant: { id: spot.id, name: spot.name },
            categoriesCount: cats.length,
            categoriesSample: cats.slice(0, 50).map(c => ({ id: c.id, name: c.name })),
            costCentersSample: ccs.slice(0, 10),
            allVariants: variants.map(v => ({ id: v.id, name: v.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
