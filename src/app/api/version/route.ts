import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "d928f22-force-v2",
        status: "BUILD_FIXED",
        timestamp: new Date().toISOString()
    });
}
