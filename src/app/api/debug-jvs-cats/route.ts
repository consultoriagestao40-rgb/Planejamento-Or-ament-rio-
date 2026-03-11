import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const facilitiesId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const tratmentosId = '0013c839-93bb-472d-ba64-092c89e1cacf';

        const [facilitiesCats, tratmentosCats] = await Promise.all([
            prisma.category.findMany({ where: { tenantId: facilitiesId } }),
            prisma.category.findMany({ where: { tenantId: tratmentosId } })
        ]);

        const sharedNames = facilitiesCats.filter(fc => tratmentosCats.some(tc => tc.name === fc.name)).map(c => c.name);
        const sharedIds = facilitiesCats.filter(fc => tratmentosCats.some(tc => tc.id === fc.id)).map(c => c.id);

        const leakCheck = await prisma.realizedEntry.findMany({
            where: {
                amount: { gte: 120000, lte: 130000 },
                year: 2026,
                month: 0
            },
            include: { tenant: true, category: true }
        });

        return NextResponse.json({
            success: true,
            facilitiesCount: facilitiesCats.length,
            tratmentosCount: tratmentosCats.length,
            sharedNames,
            sharedIds,
            leakCheck: leakCheck.map(l => ({ tenant: l.tenant.name, cat: l.category.name, amount: l.amount })),
            advice: "If a value ~127k appears in Facilities but belongs to another company, we found the leak."
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
