import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "ec496d9-final",
        version: "0.1.2",
        timestamp: new Date().toISOString(),
        message: "Build Fixed - Deploying Data Integrily Fixes"
    });
}
