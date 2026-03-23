import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v58.2',
        lastUpdate: "2026-03-23 16:10 (Enhanced Visual Analysis Indicators)"
    });
}
