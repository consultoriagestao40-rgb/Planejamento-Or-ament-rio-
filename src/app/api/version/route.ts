import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.2.4-final-conduit",
        version: "0.2.4",
        timestamp: new Date().toISOString(),
        message: "Version 0.2.4 - MULTI-VARIANT ID RECOVERY & Sync Fixed",
        status: "READY"
    });
}
