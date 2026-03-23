import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v53.0',
        lastUpdate: "2026-03-22 21:40 (Master Data Sync + Realizado Safety)"
    });
}
