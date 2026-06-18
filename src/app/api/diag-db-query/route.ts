import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const year = 2026;
        const month = 5;

        // Get count and sum of all entries for May 2026 grouped by viewMode
        const byViewMode = await prisma.realizedEntry.groupBy({
            by: ['viewMode'],
            where: { tenantId, year, month },
            _count: true,
            _sum: { amount: true }
        });

        // Get all entries for May 2026 competencia
        const competenciaEntries = await prisma.realizedEntry.findMany({
            where: { tenantId, year, month, viewMode: 'competencia' },
            include: { category: true },
            orderBy: { amount: 'desc' }
        });

        // Get all entries for May 2026 caixa
        const caixaEntries = await prisma.realizedEntry.findMany({
            where: { tenantId, year, month, viewMode: 'caixa' },
            include: { category: true },
            orderBy: { amount: 'desc' }
        });

        return NextResponse.json({
            success: true,
            byViewMode,
            competencia: competenciaEntries.map(e => ({
                id: e.id,
                catCode: e.category.id,
                catName: e.category.name,
                cc: e.costCenterId,
                amount: e.amount,
                desc: e.description,
                extId: e.externalId
            })),
            caixa: caixaEntries.map(e => ({
                id: e.id,
                catCode: e.category.id,
                catName: e.category.name,
                cc: e.costCenterId,
                amount: e.amount,
                desc: e.description,
                extId: e.externalId
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
