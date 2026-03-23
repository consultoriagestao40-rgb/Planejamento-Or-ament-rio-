import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v57.0',
        lastUpdate: "2026-03-23 10:10 (Fixed Dash Aggregation & CA Sync Endpoint)"
    });
}
