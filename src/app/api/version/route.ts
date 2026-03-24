import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.0',
        lastUpdate: "2026-03-24 20:40 (Fluxo de Aprovação e Fechamento de Orçamentos)"
    });
}
