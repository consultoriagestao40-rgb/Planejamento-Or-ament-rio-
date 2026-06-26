import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
}
