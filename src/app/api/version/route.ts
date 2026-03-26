import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.6',
        lastUpdate: "2026-03-26 00:38 (Recuperação de orçamentos vinculados a unidades inativas)"
    });
}
