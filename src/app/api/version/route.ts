import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.7',
        lastUpdate: "2026-03-24 21:20 (Ajuste Cadeados e Taxa de Tributos)"
    });
}
