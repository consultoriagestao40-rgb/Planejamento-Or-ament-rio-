import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.8',
        lastUpdate: '2026-03-26 - FINAL FIX: Deduplication by Normalized Name & ID-to-Name CC mapping (v66.8)',
        status: 'stable'
    });
}
