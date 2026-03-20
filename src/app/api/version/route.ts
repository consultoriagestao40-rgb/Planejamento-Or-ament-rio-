import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.27-deep-diag",
        version: '0.9.87',
        timestamp: new Date().toISOString(),
        message: 'Version 0.9.87 - Full API Alignment',
        status: "STABLE"
    });
}
