import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.3.3-final-conduit",
        version: "0.3.3",
        timestamp: new Date().toISOString(),
        message: "Version 0.3.3 - AGNOSTIC ID MAPPING & FLEXIBLE FILTERS",
        status: "READY"
    });
}
