import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v56.0',
        lastUpdate: "2026-03-23 09:10 (Fixed Structure Sync & Token Refresh)"
    });
}
