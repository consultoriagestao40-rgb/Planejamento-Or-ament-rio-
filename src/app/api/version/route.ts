import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.10',
        lastUpdate: '2026-03-26 - FINAL SUCCESS: Precision dedup by NormCatName for total consistency (v66.10)',
        status: 'stable'
    });
}
