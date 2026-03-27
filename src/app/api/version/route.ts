import { NextResponse } from 'next/server';
// Trigger v66.24 build retry

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.24',
        lastUpdate: '2026-03-27 - FINAL SUCCESS: Robust Name Reconciliation Applied',
        status: 'stable'
    });
}
