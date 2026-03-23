import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v54.0',
        lastUpdate: "2026-03-22 22:30 (Restricted Sync/Import to MASTER)"
    });
}
