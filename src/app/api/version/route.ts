import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.1.5-deploy-check",
        version: "0.1.5",
        timestamp: new Date().toISOString(),
        message: "Version 0.1.5 - With Debug Metadata in /api/transactions",
        status: "ACTIVE"
    });
}
