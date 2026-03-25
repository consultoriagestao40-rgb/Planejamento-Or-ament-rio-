import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v63.9',
        lastUpdate: "2026-03-24 22:30 (Correção Crítica de ID Composto no Servidor)"
    });
}
