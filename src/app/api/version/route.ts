import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.25-robust-sync",
        version: "0.9.25",
        timestamp: new Date().toISOString(),
        message: "Version 0.9.25 - Robust Category ID Filtering and Sales Sync Logs",
        status: "STABLE"
    });
}
