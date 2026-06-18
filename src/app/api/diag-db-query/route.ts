import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: { costCenter: true }
        });

        // Group by costCenterId
        const ccStats: Record<string, { id: string, name: string | null, totalRealized: number, count: number }> = {};
        
        entries.forEach(e => {
            const ccId = e.costCenterId || 'DEFAULT';
            const ccName = e.costCenter ? e.costCenter.name : 'Sem Centro de Custo (Geral)';
            if (!ccStats[ccId]) {
                ccStats[ccId] = {
                    id: ccId,
                    name: ccName,
                    totalRealized: 0,
                    count: 0
                };
            }
            ccStats[ccId].totalRealized += e.amount;
            ccStats[ccId].count += 1;
        });

        return NextResponse.json({
            success: true,
            totalRealizedEntries: entries.length,
            stats: Object.values(ccStats)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
