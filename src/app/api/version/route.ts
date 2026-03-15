import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "26a8f00-logic-sync",
        version: "0.1.4",
        timestamp: new Date().toISOString(),
        message: "Logic Unification - Grid vs Modal",
        status: "FIX_APPLIED"
    });
}
