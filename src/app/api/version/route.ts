import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v61.0',
        lastUpdate: "2026-03-24 17:00 (Retenção na Fonte e Granularidade Excel)"
    });
}
