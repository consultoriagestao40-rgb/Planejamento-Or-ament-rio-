
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncTenants } from '@/lib/cronSync'; // Assuming I can export/extract it

export async function GET() {
    try {
        // 1. EXECUTE SYNC (v0.9.42 logic)
        // Note: For internal calls, we can trigger the logic directly or call the public route
        const tenants = await prisma.tenant.findMany();
        const report: any[] = [];

        // Simple check before/after
        const audit = async () => {
            const results: any = {};
            for (const t of tenants) {
                const rev = await prisma.realizedEntry.aggregate({
                    _sum: { amount: true },
                    where: { tenantId: t.id, year: 2026, month: 1, amount: { gt: 0 } }
                });
                const cost = await prisma.realizedEntry.aggregate({
                    _sum: { amount: true },
                    where: { tenantId: t.id, year: 2026, month: 1, amount: { lt: 0 } }
                });
                results[t.name] = { revenue: rev._sum.amount || 0, costs: cost._sum.amount || 0 };
            }
            return results;
        };

        const before = await audit();
        
        // v0.9.46: Trigger actual sync silently
        await syncTenants(2026);

        const after = await audit();

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            status: "Functional Audit",
            parity: after
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
