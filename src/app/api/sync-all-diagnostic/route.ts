
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runCronSync } from '@/lib/cronSync';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const audit = async () => {
            const results: any = {};
            for (const t of tenants) {
                const views: any = {};
                for (const vm of ['competencia', 'caixa']) {
                    const rev = await prisma.realizedEntry.aggregate({
                        _sum: { amount: true },
                        where: { tenantId: t.id, year: 2026, month: 1, viewMode: vm, amount: { gt: 0 } }
                    });
                    const exp = await prisma.realizedEntry.aggregate({
                        _sum: { amount: true },
                        where: { tenantId: t.id, year: 2026, month: 1, viewMode: vm, amount: { lt: 0 } }
                    });
                    views[vm] = { revenue: rev._sum.amount || 0, expenses: exp._sum.amount || 0 };
                }
                results[t.name] = views;
            }
            return results;
        };

        const parity = await audit();

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            status: "Functional Audit v0.9.50",
            parity
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
