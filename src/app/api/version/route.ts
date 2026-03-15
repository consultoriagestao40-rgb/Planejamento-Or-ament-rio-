import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.3.5-final-stable",
        version: "0.3.5",
        timestamp: new Date().toISOString(),
        message: "Version 0.3.5 - UNIFIED VENCIMENTO SEARCH & WIDE BUFFER (NOV-DEC)",
        status: "STABLE"
    });
}
