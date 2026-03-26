import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const month = parseInt(searchParams.get('month') || '1');
    const year = parseInt(searchParams.get('year') || '2026');

    if (!categoryId) return NextResponse.json({ error: 'Missing categoryId' });

    try {
        const budgets = await prisma.budgetEntry.findMany({
            where: { categoryId, month, year },
            include: { 
                costCenter: true,
                tenant: true
            }
        });

        const mapping = budgets.map(b => ({
            amount: b.amount,
            ccName: b.costCenter?.name || 'Geral',
            ccId: b.costCenterId,
            tenantName: b.tenant?.name,
            tenantId: b.tenantId
        }));

        return NextResponse.json({ success: true, mapping });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
