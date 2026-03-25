import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.5',
        lastUpdate: "2026-03-24 21:10 (Correção e Rota de Manutenção para Tributos Retroativos)"
    });
}
