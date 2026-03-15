import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.1.8-final-sync",
        version: "0.1.8",
        timestamp: new Date().toISOString(),
        message: "Version 0.1.8 - Final Logic Convergence & Nuclear Cleanup Fixed",
        status: "READY"
    });
}
