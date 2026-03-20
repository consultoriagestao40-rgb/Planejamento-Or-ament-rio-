import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const result = await prisma.realizedEntry.deleteMany({
            where: {
                month: { in: [1, 2] },
                year: 2026
            }
        });

        return NextResponse.json({
            success: true,
            message: `LIMPEZA GLOBAL CONCLUÍDA! ${result.count} registros de Janeiro e Fevereiro de 2026 foram removidos de TODAS as empresas.`,
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
