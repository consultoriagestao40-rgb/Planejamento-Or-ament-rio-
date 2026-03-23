import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v58.4',
        lastUpdate: "2026-03-23 16:30 (Added Auto-Migration Support)"
    });
}
