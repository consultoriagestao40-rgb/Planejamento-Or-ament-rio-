
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        version: "1.0.4-nuclear-fix",
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        git: "634c6c2..c3623e4-broaden-caixa"
    });
}
