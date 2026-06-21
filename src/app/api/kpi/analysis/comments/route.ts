import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { analysisId, userName, content } = body;

        if (!analysisId || !userName || !content) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        const comment = await prisma.indicatorComment.create({
            data: {
                analysisId,
                userName,
                content
            }
        });

        return NextResponse.json({ success: true, data: comment });
    } catch (e: any) {
        console.error('[API COMMENTS POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
