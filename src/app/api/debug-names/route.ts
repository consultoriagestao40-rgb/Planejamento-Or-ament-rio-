import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const month = parseInt(searchParams.get('month') || '1');
    const year = parseInt(searchParams.get('year') || '2026');

    try {
        const t = await prisma.tenant.findFirst({ where: { name: { contains: 'FACILITIES', mode: 'insensitive' } } });
        if (!t) return NextResponse.json({ error: 'Tenant not found' });

        const budgets = await prisma.budgetEntry.findMany({
            where: { tenantId: t.id, month: 1, year: 2026 },
            include: { 
                costCenter: true,
                category: true
            }
        });

        const ccs = await prisma.costCenter.findMany({ where: { tenantId: t.id } });

        return NextResponse.json({ 
            success: true, 
            budgets: budgets.filter(b => b.amount > 0).map(b => ({
                cat: b.category?.name,
                cc: b.costCenter?.name || 'Geral',
                amt: b.amount,
                id: b.costCenterId
            })),
            ccs: ccs.map(c => ({ id: c.id, name: c.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
