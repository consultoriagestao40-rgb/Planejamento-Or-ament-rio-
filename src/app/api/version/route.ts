import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.26-sales-fix-2",
        version: "0.9.26",
        timestamp: new Date().toISOString(),
        message: "Version 0.9.26 - Fix Sales Status Parsing and Robust Amount Handling",
        status: "STABLE"
    });
}
