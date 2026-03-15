import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "f7c58a1-window-fix",
        timestamp: new Date().toISOString()
    });
}
