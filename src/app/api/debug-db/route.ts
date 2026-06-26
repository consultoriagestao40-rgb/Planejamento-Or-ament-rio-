import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true }
        });

        const jvsTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';

        // Get all accesses specifically for coordenacao@grupojvsserv.com.br
        const coordUser = users.find(u => u.email === 'coordenacao@grupojvsserv.com.br');
        let coordAccesses: any[] = [];
        if (coordUser) {
            coordAccesses = await prisma.userCostCenterAccess.findMany({
                where: { userId: coordUser.id },
                include: { costCenter: true }
            });
        }

        // Get all accesses specifically for JVS Facilities
        const jvsAccesses = await prisma.userCostCenterAccess.findMany({
            where: { costCenter: { tenantId: jvsTenantId } },
            include: {
                user: { select: { email: true } },
                costCenter: true
            }
        });

        return NextResponse.json({
            success: true,
            coordAccesses: coordAccesses.map(a => ({
                id: a.costCenterId,
                name: a.costCenter.name,
                tenantId: a.costCenter.tenantId
            })),
            jvsAccesses: jvsAccesses.map(a => ({
                userEmail: a.user.email,
                ccId: a.costCenterId,
                ccName: a.costCenter.name,
                accessLevel: a.accessLevel
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
