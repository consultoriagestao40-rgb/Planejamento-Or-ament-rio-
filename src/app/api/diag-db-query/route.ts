import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const jvsTrat = tenants.find(t => t.name.toUpperCase().includes('TRATMENTOS') || t.name.toUpperCase().includes('TRATAMENTOS'));
        
        let distinctRealizedCatIds: string[] = [];
        let distinctBudgetCatIds: string[] = [];

        if (jvsTrat) {
            const realized = await prisma.realizedEntry.findMany({
                where: { tenantId: jvsTrat.id, year: 2026 },
                select: { categoryId: true }
            });
            distinctRealizedCatIds = Array.from(new Set(realized.map(r => r.categoryId)));

            const budget = await prisma.budgetEntry.findMany({
                where: { tenantId: jvsTrat.id, year: 2026 },
                select: { categoryId: true }
            });
            distinctBudgetCatIds = Array.from(new Set(budget.map(b => b.categoryId)));
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            distinctRealizedCatIds,
            distinctBudgetCatIds
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
