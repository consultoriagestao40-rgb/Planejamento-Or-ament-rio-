import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.4',
        lastUpdate: "2026-03-25 23:36 (Restauração da API de Resumo por Centro de Custo)"
    });
}
