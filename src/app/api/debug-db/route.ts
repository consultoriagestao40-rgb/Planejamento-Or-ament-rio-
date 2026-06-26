import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('secret') !== 'antigravity-secret-2026') {
        return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    return NextResponse.json({ success: true, message: 'Ready' });
}
