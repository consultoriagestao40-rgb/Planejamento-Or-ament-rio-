import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: { month: 0, year: 2026 },
            include: { category: { select: { name: true } } }
        });

        const comparison: Record<string, { comp: number, caixa: number }> = {};

        for (const e of entries) {
            const name = e.category?.name || 'Unknown';
            if (!comparison[name]) comparison[name] = { comp: 0, caixa: 0 };
            if (e.viewMode === 'competencia') comparison[name].comp += e.amount;
            if (e.viewMode === 'caixa') comparison[name].caixa += e.amount;
        }

        const details = Object.entries(comparison)
            .map(([name, vals]) => ({
                name,
                comp: vals.comp,
                caixa: vals.caixa,
                diff: Math.abs(vals.comp - vals.caixa)
            }))
            .sort((a, b) => b.diff - a.diff);

        const totalComp = details.reduce((sum, d) => sum + d.comp, 0);
        const totalCaixa = details.reduce((sum, d) => sum + d.caixa, 0);

        return NextResponse.json({
            success: true,
            summary: {
                totalJanComp: totalComp,
                totalJanCaixa: totalCaixa,
                globalDiff: totalComp - totalCaixa,
                identicalCount: details.filter(d => d.diff === 0).length,
                differentCount: details.filter(d => d.diff > 0).length
            },
            topDifferences: details.filter(d => d.diff > 0).slice(0, 50),
            allIdentical: details.filter(d => d.diff === 0).slice(0, 50)
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
