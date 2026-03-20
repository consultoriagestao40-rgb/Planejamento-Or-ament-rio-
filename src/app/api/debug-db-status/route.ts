import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const budgetsByYear = await prisma.budgetEntry.groupBy({
            by: ['year'],
            _count: { _all: true }
        });

        const realizedByYear = await prisma.realizedEntry.groupBy({
            by: ['year'],
            _count: { _all: true }
        });

        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

        return NextResponse.json({
            success: true,
            years: {
                budgets: budgetsByYear,
                realized: realizedByYear
            },
            tenants
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
