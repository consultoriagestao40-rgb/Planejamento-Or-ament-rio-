import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.2',
        lastUpdate: "2026-03-24 21:45 (Análise Vertical Fixa na Tela de Lançamento)"
    });
}
