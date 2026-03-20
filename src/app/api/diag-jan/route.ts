import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: { month: 1, year: 2026 },
            orderBy: { amount: 'desc' }
        });

        const revenue = entries.filter(e => e.categoryId.includes(':01') || e.categoryId.startsWith('01'));
        const totalRev = revenue.reduce((acc, e) => acc + e.amount, 0);

        return NextResponse.json({
            count: entries.length,
            totalRevenueJan: totalRev,
            expected: 156022.98,
            diff: 156022.98 - totalRev,
            entries: entries.map(e => ({
                cat: e.categoryId,
                amt: e.amount,
                cc: e.costCenterId || 'NULL',
                tenant: e.tenantId,
                desc: e.description
            }))
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message });
    }
}
