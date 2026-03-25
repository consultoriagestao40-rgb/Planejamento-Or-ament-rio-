import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.4',
        lastUpdate: "2026-03-24 21:55 (Limpeza de nomes [INATIVO] no Título)"
    });
}
