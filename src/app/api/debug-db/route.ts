import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('secret') !== 'antigravity-secret-2026') {
        return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const action = searchParams.get('action');
    if (action === 'query-sql') {
        const sql = searchParams.get('sql');
        if (!sql) return NextResponse.json({ success: false, error: 'SQL missing' });
        try {
            const result = await prisma.$queryRawUnsafe(sql);
            return NextResponse.json({ success: true, result });
        } catch (e: any) {
            return NextResponse.json({ success: false, error: e.message });
        }
    }

    return NextResponse.json({ success: true, message: 'Ready' });
}
