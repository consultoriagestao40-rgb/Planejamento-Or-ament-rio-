import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.1.7-sum-logic",
        version: "0.1.7",
        timestamp: new Date().toISOString(),
        message: "Version 0.1.7 - Multi-Category Sum Logic for Modal Alignment",
        status: "ACTIVE"
    });
}
