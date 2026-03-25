import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.5',
        lastUpdate: "2026-03-25 09:28 (Salvamento Blindado: Recuperação de ID por Nome e Diagnóstico Profundo)"
    });
}
