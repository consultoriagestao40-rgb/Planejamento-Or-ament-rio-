import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.1',
        lastUpdate: "2026-03-24 21:40 (Exibição do Nome do Centro de Custo no Título)"
    });
}
