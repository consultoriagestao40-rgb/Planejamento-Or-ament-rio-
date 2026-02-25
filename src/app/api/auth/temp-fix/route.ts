import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

        // Find all budget entries with amount > 0
        const budgets = await prisma.budgetEntry.findMany({
            where: { amount: { gt: 0 } },
            include: { category: { select: { tenantId: true, name: true } } }
        });

        const mismatched = budgets.filter(b => b.tenantId !== b.category.tenantId);

        const report = mismatched.map(b => {
            const entryTenant = tenants.find(t => t.id === b.tenantId)?.name;
            const catTenant = tenants.find(t => t.id === b.category.tenantId)?.name;
            return {
                id: b.id,
                amount: b.amount,
                entryTenant,
                catTenant,
                categoryName: b.category.name,
                categoryId: b.categoryId
            };
        });

        // ACTION: Fix them
        // For each mismatched entry, we need to find the category with the SAME NAME but owned by the ENTRY TENANT.
        const fixResults = [];
        for (const item of report) {
            // Find category in the entryTenant that has the same name
            const correctCategory = await prisma.category.findFirst({
                where: {
                    name: item.categoryName,
                    tenantId: budgets.find(b => b.id === item.id)!.tenantId
                }
            });

            if (correctCategory) {
                // Update the entry to use the correct category
                await prisma.budgetEntry.update({
                    where: { id: item.id },
                    data: { categoryId: correctCategory.id }
                });
                fixResults.push({ id: item.id, status: 'Fixed', newCategoryId: correctCategory.id });
            } else {
                fixResults.push({ id: item.id, status: 'Not Fixed - Correct category not found for tenant' });
            }
        }

        return NextResponse.json({ success: true, mismatched: report, fixResults });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
