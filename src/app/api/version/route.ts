import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.8',
        lastUpdate: "2026-03-24 21:25 (Correção Emergencial: Impostos e Desbloqueio Master)"
    });
}
