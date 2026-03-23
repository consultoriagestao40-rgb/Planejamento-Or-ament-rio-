import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v54.1',
        lastUpdate: "2026-03-22 22:35 (Full Dashboard Import/Sync Restriction)"
    });
}
