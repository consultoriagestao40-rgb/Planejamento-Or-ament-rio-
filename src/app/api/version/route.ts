import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.11',
        lastUpdate: '2026-03-26 - FINAL SUCCESS: Hierarchical expansion + Synonym dedup for total consistency (v66.11)',
        status: 'stable'
    });
}
