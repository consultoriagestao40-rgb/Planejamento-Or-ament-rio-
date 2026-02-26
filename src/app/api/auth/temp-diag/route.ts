import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const entries = await prisma.realizedEntry.findMany({
            take: 2000,
            orderBy: { createdAt: 'desc' }
        });

        const grouped: Record<string, { competencia?: number, caixa?: number }> = {};

        for (const e of entries) {
            const key = `${e.tenantId.substring(0, 4)}-${e.categoryId.substring(0, 4)}-${e.month}-${e.year}`;
            if (!grouped[key]) grouped[key] = {};
            if (e.viewMode === 'competencia') grouped[key].competencia = e.amount;
            if (e.viewMode === 'caixa') grouped[key].caixa = e.amount;
        }

        let diffCount = 0;
        let totalCount = 0;
        const diffs = [];

        for (const key in grouped) {
            totalCount++;
            const vals = grouped[key];
            if (vals.competencia !== vals.caixa) {
                diffCount++;
                if (diffs.length < 20) {
                    diffs.push({ key, comp: vals.competencia, caixa: vals.caixa });
                }
            }
        }

        return NextResponse.json({
            success: true,
            stats: {
                totalEntries: entries.length,
                uniqueGroupsChecked: totalCount,
                groupsWithDifferences: diffCount,
                percentIdentical: totalCount > 0 ? ((totalCount - diffCount) / totalCount * 100).toFixed(2) + '%' : '0%'
            },
            sampleDiffs: diffs
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
