import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.2',
        lastUpdate: "2026-03-24 20:55 (Ajustes Finais no Bloqueio e Confirmação de Reabertura)"
    });
}
