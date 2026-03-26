import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.15',
        lastUpdate: '2026-03-26 - FINAL SUCCESS: Modal Data Mismatch fixed (Hierarchy + Month Filter)',
        status: 'stable'
    });
}
