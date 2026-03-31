import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name') || 'EQUIPE';

        const ccs = await prisma.costCenter.findMany({
            where: { name: { contains: name, mode: 'insensitive' } },
            select: { id: true, name: true, tenantId: true }
        });

        const budgets = await prisma.budgetEntry.findMany({
            where: {
                costCenterId: { in: ccs.map(c => c.id) },
                year: 2026
            },
            select: { costCenterId: true, categoryId: true, month: true, amount: true, tenantId: true },
            take: 20
        });

        return NextResponse.json({
            costCenters: ccs,
            budgets,
            summary: `Found ${ccs.length} CCs and ${budgets.length} budget entries`
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
