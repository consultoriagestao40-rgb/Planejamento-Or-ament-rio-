import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, isResolved, resolvedBy, resolutionNotes } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Parâmetro id é obrigatório' }, { status: 400 });
        }

        const resolved = await prisma.deviationAnalysis.update({
            where: { id },
            data: {
                isResolved: !!isResolved,
                resolvedAt: isResolved ? new Date() : null,
                resolvedBy: isResolved ? (resolvedBy || 'Sistema') : null,
                resolutionNotes: isResolved ? (resolutionNotes || null) : null
            },
            include: {
                category: { select: { id: true, name: true } },
                responsible: { select: { id: true, name: true, email: true, avatarUrl: true } }
            }
        });

        return NextResponse.json({ success: true, data: resolved });
    } catch (e: any) {
        console.error('[API DEVIATIONS RESOLVE PATCH] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
