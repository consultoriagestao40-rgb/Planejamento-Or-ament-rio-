import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');

    try {
        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
        const budgetCount = await prisma.budgetEntry.count({ where: { year } });
        const realizedCount = await prisma.realizedEntry.count({ where: { year } });
        
        const sampleBudget = await prisma.budgetEntry.findMany({
            where: { year, amount: { gt: 0 } },
            take: 5,
            include: { category: true, costCenter: true }
        });

        const sampleRealized = await prisma.realizedEntry.findMany({
            where: { year, amount: { gt: 0 } },
            take: 5,
            include: { category: true, costCenter: true }
        });

        return NextResponse.json({
            success: true,
            year,
            tenants,
            budgetCount,
            realizedCount,
            sampleBudget: sampleBudget.map(b => ({
                id: b.id,
                amount: b.amount,
                tenant: b.tenantId,
                ccId: b.costCenterId,
                ccName: b.costCenter?.name,
                catId: b.categoryId,
                catName: b.category?.name
            })),
            sampleRealized: sampleRealized.map(r => ({
                id: r.id,
                amount: r.amount,
                tenant: r.tenantId,
                ccId: r.costCenterId,
                ccName: r.costCenter?.name
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
