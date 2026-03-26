import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.13',
        lastUpdate: '2026-03-26 - FINAL SUCCESS: Month Sync (0-indexed vs 1-indexed) fixed',
        status: 'stable'
    });
}
