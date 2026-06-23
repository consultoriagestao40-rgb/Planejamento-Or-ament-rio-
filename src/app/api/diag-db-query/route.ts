import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });
        
        // Summarize budget by tenant, category name and month
        const budgets = await prisma.budgetEntry.findMany({
            where: { year: 2026 },
            include: { category: true }
        });

        const tenantBudgets: Record<string, Record<string, Record<number, number>>> = {};
        budgets.forEach(b => {
            const tenantName = tenants.find(t => t.id === b.tenantId)?.name || b.tenantId;
            const catName = b.category.name;
            if (!tenantBudgets[tenantName]) tenantBudgets[tenantName] = {};
            if (!tenantBudgets[tenantName][catName]) tenantBudgets[tenantName][catName] = {};
            tenantBudgets[tenantName][catName][b.month] = (tenantBudgets[tenantName][catName][b.month] || 0) + b.amount;
        });

        return NextResponse.json({
            success: true,
            tenants,
            tenantBudgets
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
