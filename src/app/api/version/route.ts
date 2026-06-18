import { NextResponse } from 'next/server';
// Trigger v66.24 build retry

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.27',
        lastUpdate: '2026-06-18 - Diagnostic update validation',
        status: 'stable'
    });
}
