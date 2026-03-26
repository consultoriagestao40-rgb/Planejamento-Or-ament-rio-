import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.7',
        lastUpdate: '2026-03-26 - FINAL FIX: Logical deduplication for budgets (v66.7)',
        status: 'stable'
    });
}
