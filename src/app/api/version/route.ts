import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.22-deep-audit",
        version: "0.9.22",
        timestamp: new Date().toISOString(),
        message: "Version 0.9.22 - Deep API Audit Jan 2026",
        status: "STABLE"
    });
}
