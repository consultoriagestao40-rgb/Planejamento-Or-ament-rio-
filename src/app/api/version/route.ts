import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.2.0-clean-sync",
        version: "0.2.0",
        timestamp: new Date().toISOString(),
        message: "Version 0.2.0 - Strict Deduplication & Absolute Rateio Value",
        status: "READY"
    });
}
