import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.6',
        lastUpdate: "2026-03-24 21:15 (Correção Definitiva da Taxa de Tributos no Lançamento)"
    });
}
