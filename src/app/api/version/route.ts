import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.3',
        lastUpdate: '2026-03-26 - Modal Budget Mapping by Company & Name Normalization',
        status: 'stable'
    });
}
