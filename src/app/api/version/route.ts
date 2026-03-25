import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.2',
        lastUpdate: "2026-03-25 08:58 (Diagnóstico Front+Back: Identificação Precisa de Erros)"
    });
}
