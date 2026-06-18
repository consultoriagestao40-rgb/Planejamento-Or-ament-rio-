import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const year = 2026;
        const month = 5;

        // 1. Get total realized count and sum
        const stats = await prisma.realizedEntry.aggregate({
            where: { tenantId, year, month },
            _count: true,
            _sum: { amount: true }
        });

        // 2. Group by viewMode to see Caixa vs Competencia
        const byViewMode = await prisma.realizedEntry.groupBy({
            by: ['viewMode'],
            where: { tenantId, year, month },
            _count: true,
            _sum: { amount: true }
        });

        // 3. Find some sample entries (top 20)
        const samples = await prisma.realizedEntry.findMany({
            where: { tenantId, year, month },
            take: 20,
            orderBy: { categoryId: 'asc' },
            select: {
                id: true,
                categoryId: true,
                costCenterId: true,
                amount: true,
                externalId: true,
                viewMode: true,
                description: true
            }
        });

        // 4. Look for duplicate externalIds in the database
        const duplicatesQuery = await prisma.$queryRaw`
            SELECT "externalId", "viewMode", COUNT(*), SUM(amount)
            FROM "RealizedEntry"
            WHERE "tenantId" = ${tenantId} AND year = ${year} AND month = ${month}
            GROUP BY "externalId", "viewMode"
            HAVING COUNT(*) > 1
        `;

        return NextResponse.json({
            success: true,
            stats,
            byViewMode,
            samples,
            duplicatesQuery
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}

