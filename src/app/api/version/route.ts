import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v59.2',
        lastUpdate: "2026-03-24 09:30 (Justification Table Data Support)"
    });
}
