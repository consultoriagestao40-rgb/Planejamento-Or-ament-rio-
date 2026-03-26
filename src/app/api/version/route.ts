import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v65.1',
        lastUpdate: "2026-03-25 21:55 (Bypass de Pooler usando DATABASE_URL_UNPOOLED)"
    });
}
