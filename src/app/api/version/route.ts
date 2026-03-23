import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v53.1',
        lastUpdate: "2026-03-22 22:05 (Cost Center Activity Tracking + Cleanup)"
    });
}
