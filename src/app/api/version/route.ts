import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.0',
        lastUpdate: "2026-03-24 21:35 (Correção Final do Erro 500 e Detalhamento de Erros)"
    });
}
