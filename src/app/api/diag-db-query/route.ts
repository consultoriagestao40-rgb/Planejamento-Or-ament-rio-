import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const costCenters = await prisma.costCenter.findMany({
            include: { tenant: true }
        });

        const tenantData = tenants.map(t => {
            const tCCs = costCenters.filter(cc => cc.tenantId === t.id);
            const activeCCs = tCCs.filter(cc => !cc.name.toUpperCase().includes('[INATIVO]'));
            const inactiveCCs = tCCs.filter(cc => cc.name.toUpperCase().includes('[INATIVO]'));
            return {
                tenantId: t.id,
                tenantName: t.name,
                totalCCs: tCCs.length,
                activeCount: activeCCs.length,
                inactiveCount: inactiveCCs.length,
                sampleActive: activeCCs.slice(0, 5).map(cc => ({ id: cc.id, name: cc.name })),
                sampleInactive: inactiveCCs.slice(0, 5).map(cc => ({ id: cc.id, name: cc.name }))
            };
        });

        return NextResponse.json({
            success: true,
            tenants: tenantData
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
