import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.20',
        lastUpdate: '2026-03-26 - FINAL VICTORY: Corrected hierarchy startsWith matching',
        status: 'stable'
    });
}
