import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.6',
        lastUpdate: '2026-03-26 - FINAL FIX: Category-specific modal budget filtering',
        status: 'stable'
    });
}
