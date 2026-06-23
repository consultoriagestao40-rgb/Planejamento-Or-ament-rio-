import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const analyses = await prisma.detailedAnalysis.findMany({
            orderBy: { updatedAt: 'desc' }
        });
        
        // Find all budget entries for 2026
        const budgets = await prisma.budgetEntry.findMany({
            where: { year: 2026 },
            include: { category: true }
        });
        
        const realized = await prisma.realizedEntry.findMany({
            where: { year: 2026, viewMode: 'competencia' },
            include: { category: true }
        });

        // Let's summarize budget by category and month
        const budgetSummary: Record<string, Record<number, number>> = {};
        budgets.forEach(b => {
            const catName = b.category.name;
            if (!budgetSummary[catName]) budgetSummary[catName] = {};
            budgetSummary[catName][b.month] = (budgetSummary[catName][b.month] || 0) + b.amount;
        });

        // Summarize realized by category and month
        const realizedSummary: Record<string, Record<number, number>> = {};
        realized.forEach(r => {
            const catName = r.category.name;
            if (!realizedSummary[catName]) realizedSummary[catName] = {};
            realizedSummary[catName][r.month] = (realizedSummary[catName][r.month] || 0) + r.amount;
        });

        return NextResponse.json({
            success: true,
            analyses,
            budgetSummary,
            realizedSummary
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
