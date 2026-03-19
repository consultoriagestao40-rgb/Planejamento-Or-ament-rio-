import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.24-sales-fix",
        version: "0.9.24",
        timestamp: new Date().toISOString(),
        message: "Version 0.9.24 - Fix Sales API endpoint and Revenue Filter",
        status: "STABLE"
    });
}
