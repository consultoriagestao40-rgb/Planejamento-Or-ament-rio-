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
                year: 2026,
                month: 0,
                category: { name: { startsWith: '01' } }
            },
            include: { tenant: true, category: true }
        });

        // Group by Tenant Name and Category Name to see totals
        const analysis = new Map<string, number>();
        leakCheck.forEach(l => {
            const key = `${l.tenant.name} | ${l.category.name}`;
            analysis.set(key, (analysis.get(key) || 0) + l.amount);
        });

        return NextResponse.json({
            success: true,
            summary: Array.from(analysis.entries()).map(([key, total]) => ({ key, total })),
            sharedNames,
            sharedIds,
            advice: "Compare the 'total' here with what you see in the Modal. If they match, then the Grid is correct based on DB. If they don't match, we need to find why the DB has extra rows."
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
