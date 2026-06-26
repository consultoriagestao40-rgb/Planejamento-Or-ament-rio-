import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true }
        });

        const ccAccesses = await prisma.userCostCenterAccess.findMany({
            include: {
                user: { select: { email: true } },
                costCenter: { select: { id: true, name: true } }
            }
        });

        return NextResponse.json({
            success: true,
            users,
            accesses: ccAccesses.map(a => ({
                userEmail: a.user.email,
                costCenterId: a.costCenterId,
                costCenterName: a.costCenter.name,
                accessLevel: a.accessLevel
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
