import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.1.9-gross-sync",
        version: "0.1.9",
        timestamp: new Date().toISOString(),
        message: "Version 0.1.9 - Strict Competence & Gross Category Rateio",
        status: "READY"
    });
}
