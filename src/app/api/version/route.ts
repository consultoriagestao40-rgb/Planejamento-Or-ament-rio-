import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.2',
        lastUpdate: "2026-03-25 22:42 (Recuperação de conexão direta com POSTGRES_URL_NON_POOLING)"
    });
}
