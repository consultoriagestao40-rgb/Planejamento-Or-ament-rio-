import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.0.2',
        lastUpdate: "2026-03-24 22:42 (Diagnóstico de Manutenção de Tributos)"
    });
}
