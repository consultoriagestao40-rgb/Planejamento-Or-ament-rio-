import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.7',
        lastUpdate: "2026-03-25 21:35 (Recuperação de conexão direta e Bypass de Pooler)"
    });
}
