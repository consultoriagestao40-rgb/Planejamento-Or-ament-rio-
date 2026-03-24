import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v60.0',
        lastUpdate: "2026-03-24 15:00 (Excel Import Granularity & Date Fix)"
    });
}
