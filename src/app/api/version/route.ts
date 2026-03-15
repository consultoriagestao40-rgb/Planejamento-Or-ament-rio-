import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.3.8-final-stable",
        version: "0.3.8",
        timestamp: new Date().toISOString(),
        message: "Version 0.3.8 - FIXED IMPORT & WIDE SEARCH (NOV-DEC)",
        status: "STABLE"
    });
}
