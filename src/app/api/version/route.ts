import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.9',
        lastUpdate: "2026-03-24 21:30 (Correção do Erro 500 ao Salvar e Lógica de Tenant)"
    });
}
