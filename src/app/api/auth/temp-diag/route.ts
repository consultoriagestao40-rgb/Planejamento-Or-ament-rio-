import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: { month: 0, year: 2026, viewMode: 'competencia' }, // Jan, Competencia
            include: { category: { select: { name: true } } }
        });

        const byCategory: Record<string, number> = {};
        let totalJan = 0;

        for (const e of entries) {
            const name = e.category?.name || 'Unknown';
            byCategory[name] = (byCategory[name] || 0) + e.amount;
            totalJan += e.amount;
        }

        const topCategories = Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([name, amount]) => ({ name, amount }));

        return NextResponse.json({
            success: true,
            month: "January 2026 (Competencia)",
            totalRealized: totalJan,
            entryCount: entries.length,
            topCategories
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
