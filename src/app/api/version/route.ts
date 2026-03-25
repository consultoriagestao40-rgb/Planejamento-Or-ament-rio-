import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.3',
        lastUpdate: "2026-03-24 21:50 (AV sobre Receita Bruta e Correção de Título/ID)"
    });
}
