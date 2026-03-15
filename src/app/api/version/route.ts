import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.2.1-final-conduit",
        version: "0.2.1",
        timestamp: new Date().toISOString(),
        message: "Version 0.2.1 - Deduplication MEM-MODE & Absolute Rateio Val",
        status: "READY"
    });
}
