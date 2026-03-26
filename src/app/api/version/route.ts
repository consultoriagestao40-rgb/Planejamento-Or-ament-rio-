import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v64.9',
        lastUpdate: "2026-03-25 21:45 (Forçando conexão direta em todo o app)"
    });
}
