import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v58.6',
        lastUpdate: "2026-03-23 16:40 (Debug Justification Saving)"
    });
}
