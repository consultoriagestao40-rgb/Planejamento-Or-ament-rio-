import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v62.3',
        lastUpdate: "2026-03-24 21:00 (Adição de Margem % no Modal de Auditoria)"
    });
}
