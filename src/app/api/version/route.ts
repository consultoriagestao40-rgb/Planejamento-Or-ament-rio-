import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.4',
        lastUpdate: "2026-03-25 09:23 (Recuperação Fail-Safe de Categorias: Estabilidade 100%)"
    });
}
