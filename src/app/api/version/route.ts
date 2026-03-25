import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.1',
        lastUpdate: "2026-03-24 22:45 (Restauração Definitiva: Parsing Robusto de IDs e Limpeza Profunda)"
    });
}
