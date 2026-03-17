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

        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id, year: 2026 },
            take: 20
        });

        const variants = await prisma.tenant.findMany({ select: { id: true, name: true } });
        return NextResponse.json({
            tenant: { id: spot.id, name: spot.name },
            categoriesCount: cats.length,
            entriesCount: entries.length,
            entriesSample: entries,
            categoriesSample: cats.slice(0, 50).map(c => ({ id: c.id, name: c.name })),
            allVariants: variants.map((v: any) => ({ id: v.id, name: v.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
