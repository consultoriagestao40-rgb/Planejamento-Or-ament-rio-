import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const deleted = await prisma.realizedEntry.deleteMany({
            where: { month: 1, year: 2026 }
        });

        return NextResponse.json({
            success: true,
            deletedCount: deleted.count,
            message: "Janeiro 2026 foi TOTALMENTE APAGADO do banco de dados (Realizado)."
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
