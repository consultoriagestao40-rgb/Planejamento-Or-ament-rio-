import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.7',
        lastUpdate: "2026-03-24 22:15 (Correção Crítica de Vínculo ID Empresa/Centro de Custo)"
    });
}
