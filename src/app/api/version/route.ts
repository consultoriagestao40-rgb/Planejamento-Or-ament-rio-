import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.3.4-final-conduit",
        version: "0.3.4",
        timestamp: new Date().toISOString(),
        message: "Version 0.3.4 - REMOVED SECONDARY RESTRICTIVE FILTERS & GHOST CHECKS",
        status: "READY"
    });
}
