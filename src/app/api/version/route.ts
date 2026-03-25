import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.4',
        lastUpdate: "2026-03-24 21:05 (Correção do Cálculo de Tributos no Orçamento)"
    });
}
