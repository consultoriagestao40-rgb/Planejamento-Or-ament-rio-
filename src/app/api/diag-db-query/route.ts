import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Clean Tech Tenant not found' });
        }

        const budgets = await prisma.budgetEntry.findMany({
            where: {
                tenantId: tenant.id,
                year: 2026,
                month: 5
            },
            include: {
                category: true,
                costCenter: true
            }
        });

        const detailedBudgets = budgets.map(b => ({
            id: b.id,
            amount: b.amount,
            category: b.category.name,
            costCenter: b.costCenter ? b.costCenter.name : 'Nenhum'
        }));

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            detailedBudgets,
            totalCount: budgets.length
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
