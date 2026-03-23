import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v59.0',
        lastUpdate: "2026-03-23 17:00 (Restricted Justifications to Entry Lines)"
    });
}
