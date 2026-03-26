import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.5',
        lastUpdate: '2026-03-26 - ROBUST RECOVERY: Composite ID matching & [INATIVO] name cleanup',
        status: 'stable'
    });
}
