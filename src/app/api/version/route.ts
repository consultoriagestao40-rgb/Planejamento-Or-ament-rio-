import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.1.6-recursive-fix",
        version: "0.1.6",
        timestamp: new Date().toISOString(),
        message: "Version 0.1.6 - Recursive Category Logic for Modal Alignment",
        status: "ACTIVE"
    });
}
