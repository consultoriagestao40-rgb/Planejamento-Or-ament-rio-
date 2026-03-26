import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.0',
        lastUpdate: "2026-03-25 21:46 (Teste de sanidade de rede externa e detecção de bloqueio)"
    });
}
