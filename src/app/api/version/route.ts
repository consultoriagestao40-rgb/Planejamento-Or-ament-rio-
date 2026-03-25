import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.3',
        lastUpdate: "2026-03-25 09:12 (Correção Crítica: IDs de Categoria Compostos)"
    });
}
