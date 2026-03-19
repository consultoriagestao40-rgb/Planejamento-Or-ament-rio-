import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.27-deep-diag",
        version: '0.9.67',
        timestamp: new Date().toISOString(),
        message: 'Version 0.9.67 - Vendas Item Category Extraction Fix',
        status: "STABLE"
    });
}
