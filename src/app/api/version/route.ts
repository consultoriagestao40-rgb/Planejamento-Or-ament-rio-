import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.8',
        lastUpdate: "2026-03-26 01:09 (Ocultando unidades inativas: Clean Tech, Rio Negrinho e Rede Tonin)"
    });
}
