import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.2.3-final-conduit",
        version: "0.2.3",
        timestamp: new Date().toISOString(),
        message: "Version 0.2.3 - FIXED ID VALIDATION & Description Restore",
        status: "READY"
    });
}
