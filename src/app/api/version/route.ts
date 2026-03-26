import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.1',
        lastUpdate: '2026-03-26 - Fix Budget Comparison Mapping in Audit Modal & CC Filter Whitlisting',
        status: 'stable'
    });
}
