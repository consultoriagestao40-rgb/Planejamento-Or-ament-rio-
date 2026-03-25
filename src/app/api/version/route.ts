import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.5.1',
        lastUpdate: "2026-03-24 22:05 (Correção Prioritária de Impostos e Limpeza de Título)"
    });
}
