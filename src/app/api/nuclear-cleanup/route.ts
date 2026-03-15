import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get('year') || '2026', 10);
        const confirm = searchParams.get('confirm') === 'true';

        if (!confirm) {
            const count = await prisma.realizedEntry.count({ where: { year } });
            return NextResponse.json({ 
                message: `Existem ${count} lançamentos em ${year}. Adicione ?confirm=true para apagar TUDO.`,
                count 
            });
        }

        const deleted = await prisma.realizedEntry.deleteMany({
            where: { year }
        });

        return NextResponse.json({
            success: true,
            message: `Limpeza GLOBAL de ${year} finalizada. Removidos ${deleted.count} lançamentos.`,
            deletedCount: deleted.count
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
