import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const budgetCounts = await prisma.budgetEntry.groupBy({
            by: ['tenantId', 'year', 'month'],
            _count: { id: true },
            _sum: { amount: true }
        });

        const realizedCounts = await prisma.realizedEntry.groupBy({
            by: ['tenantId', 'year', 'month', 'viewMode'],
            _count: { id: true },
            _sum: { amount: true }
        });

        return NextResponse.json({
            success: true,
            tenants,
            budgetCounts,
            realizedCounts
        });
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            error: e.message
        });
    }
}
