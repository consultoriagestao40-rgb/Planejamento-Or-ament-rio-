import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v58.3',
        lastUpdate: "2026-03-23 16:20 (Resilient Data Fetching & Icon Fixes)"
    });
}
