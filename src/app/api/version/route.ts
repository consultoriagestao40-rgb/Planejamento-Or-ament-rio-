import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.8',
        lastUpdate: "2026-03-24 22:25 (Correção de Cálculo Automático de Tributos no Modal)"
    });
}
