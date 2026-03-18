import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        rev: "v0.9.20-sync-precision",
        version: "0.9.20",
        timestamp: new Date().toISOString(),
        message: "Version 0.9.20 - Nova Precisão de Sincronização (Outras Receitas + Filtro Competência)",
        status: "STABLE"
    });
}
