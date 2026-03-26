import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.5',
        lastUpdate: "2026-03-26 00:20 (Correção de dados: RECEITA/DESPESA e filtro de unidades INATIVO)"
    });
}
