import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.0',
        lastUpdate: "2026-03-24 22:35 (Restauração Total da Estabilidade de Salvamento - Motor de Banco de Dados)"
    });
}
