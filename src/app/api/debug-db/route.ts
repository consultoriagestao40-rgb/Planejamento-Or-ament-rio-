import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');

    try {
        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
        const budgetCount = await prisma.budgetEntry.count({ where: { year } });
        const realizedCount = await prisma.realizedEntry.count({ where: { year } });
        
        // How many budget entries have no CC (null = GERAL) vs specific CC
        const budgetNullCC = await prisma.budgetEntry.count({ where: { year, costCenterId: null } });
        const budgetWithCC = await prisma.budgetEntry.count({ where: { year, costCenterId: { not: null } } });
        
        // Sample budget entries that HAVE a specific CC
        const sampleWithCC = await prisma.budgetEntry.findMany({
            where: { year, amount: { gt: 0 }, costCenterId: { not: null } },
            take: 5,
            include: { costCenter: true }
        });

        // Sample budget entries with null CC (GERAL)
        const sampleNullCC = await prisma.budgetEntry.findMany({
            where: { year, amount: { gt: 0 }, costCenterId: null },
            take: 3,
            include: { category: true }
        });
        
        return NextResponse.json({
            success: true,
            year,
            tenants,
            budgetCount,
            realizedCount,
            budgetDistribution: {
                withNullCC: budgetNullCC,
                withSpecificCC: budgetWithCC
            },
            sampleWithCC: sampleWithCC.map((b: any) => ({
                amount: b.amount,
                tenantId: b.tenantId,
                ccId: b.costCenterId,
                ccName: b.costCenter?.name
            })),
            sampleNullCC: sampleNullCC.map((b: any) => ({
                amount: b.amount,
                tenantId: b.tenantId,
                catName: b.category?.name
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
