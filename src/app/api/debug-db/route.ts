import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sessions = await prisma.chatSession.findMany({
            where: { title: 'DEBUG_SESSION' },
            include: {
                user: { select: { email: true, role: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 20
                }
            }
        });

        const jvsTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const jvsAccesses = await prisma.userCostCenterAccess.findMany({
            where: { costCenter: { tenantId: jvsTenantId } },
            include: {
                user: { select: { email: true } },
                costCenter: true
            }
        });

        return NextResponse.json({
            success: true,
            sessions: sessions.map(s => ({
                userEmail: s.user.email,
                userRole: s.user.role,
                messages: s.messages.map(m => {
                    try {
                        return JSON.parse(m.content);
                    } catch (e) {
                        return m.content;
                    }
                })
            })),
            jvsAccesses: jvsAccesses.map(a => ({
                userEmail: a.user.email,
                ccName: a.costCenter.name,
                ccId: a.costCenterId
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
