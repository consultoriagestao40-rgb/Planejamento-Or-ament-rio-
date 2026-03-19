import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.27-deep-diag",
        version: '0.9.32',
        timestamp: new Date().toISOString(),
        message: 'Version 0.9.32 - 100% Parity (Revenue 156k, Taxes 20k, Salaries 45k) [SPOT]',
        status: "STABLE"
    });
}
