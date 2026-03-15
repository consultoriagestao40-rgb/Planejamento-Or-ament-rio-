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

        // Check for ANY realized entries for this tenant, regardless of year
        const totalEntries = await prisma.realizedEntry.count({ where: { tenantId: spot.id } });
        const yearStats = await prisma.realizedEntry.groupBy({
            by: ['year', 'viewMode'],
            where: { tenantId: spot.id },
            _count: true,
            _sum: { amount: true }
        });

        const sampleRevenues = await prisma.category.findMany({
            where: { tenantId: spot.id, name: { startsWith: '01' } },
            take: 10
        });

        return NextResponse.json({
            tenant: { id: spot.id, name: spot.name },
            categoriesCount: cats.length,
            revenueCatsSample: sampleRevenues,
            totalEntries,
            yearStats,
            debug: "Diagnostic v0.3.6 - Deep Scan"
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
