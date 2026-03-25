import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.0.1',
        lastUpdate: "2026-03-24 22:38 (Limpeza Profunda de Duplicidades e Motor de Banco de Dados)"
    });
}
