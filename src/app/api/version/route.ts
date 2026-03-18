import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.23-sales-sync",
        version: "0.9.23",
        timestamp: new Date().toISOString(),
        message: "Version 0.9.23 - Sales Module Sync (Gross Revenue + Retentions)",
        status: "STABLE"
    });
}
