import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "2d759a6-id-fix",
        version: "0.1.3",
        timestamp: new Date().toISOString(),
        message: "ID Sanitation Fix - Aligning Grid vs Modal",
        status: "DEPLOYING_FINAL_FIX"
    });
}
