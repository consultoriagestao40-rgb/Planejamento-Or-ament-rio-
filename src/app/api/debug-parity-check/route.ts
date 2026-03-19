
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        const jvs = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });

        const results: any = { ok: true, data: {} };

        if (spot) {
            const rev = await prisma.realizedEntry.aggregate({
                _sum: { amount: true },
                where: { tenantId: spot.id, year: 2026, month: 1, amount: { gt: 0 } }
            });
            const cost = await prisma.realizedEntry.aggregate({
                _sum: { amount: true },
                where: { tenantId: spot.id, year: 2026, month: 1, amount: { lt: 0 } }
            });
            results.data.spot = { revenue: rev._sum.amount || 0, costs: cost._sum.amount || 0 };
        }

        if (jvs) {
            const rev = await prisma.realizedEntry.aggregate({
                _sum: { amount: true },
                where: { tenantId: jvs.id, year: 2026, month: 1, amount: { gt: 0 } }
            });
            results.data.jvs = { revenue: rev._sum.amount || 0 };
        }

        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
