import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const year = 2026;
        const month = 1;

        const entries = await prisma.realizedEntry.findMany({
            where: { year, month, viewMode: 'competencia' },
            include: { category: true }
        });

        const summary: any = {};
        let totalRevenue = 0;
        let totalTaxes = 0;
        let saleRecords = 0;

        entries.forEach(e => {
            const catName = e.category?.name || 'Unknown';
            if (!summary[catName]) summary[catName] = 0;
            summary[catName] += e.amount;

            if (catName.startsWith('01.1') || catName.startsWith('01.2')) {
                totalRevenue += e.amount;
            }
            if (catName.startsWith('02.1')) {
                totalTaxes += e.amount;
            }
            if (e.externalId?.startsWith('SALE-')) {
                saleRecords++;
            }
        });

        return NextResponse.json({
            success: true,
            version: '0.9.23',
            jan2026: {
                totalRevenue,
                totalTaxes,
                saleRecords,
                entriesCount: entries.length,
                breakdown: summary
            }
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
