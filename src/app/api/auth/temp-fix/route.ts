import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        // 1. Find all budget entries with amount > 0 and include their category to check owner
        const budgets = await prisma.budgetEntry.findMany({
            where: { amount: { gt: 0 } },
            include: {
                category: { select: { tenantId: true, name: true } },
                tenant: { select: { name: true } }
            }
        });

        // 2. Identify entries where tenantId != category.tenantId
        const mismatched = budgets.filter(b => b.tenantId !== b.category.tenantId);

        const fixResults = [];
        for (const entry of mismatched) {
            // Find the correct category for this entry's actual tenant with the SAME name
            const correctCategory = await prisma.category.findFirst({
                where: {
                    name: entry.category.name,
                    tenantId: entry.tenantId
                }
            });

            if (!correctCategory) {
                fixResults.push({ id: entry.id, amount: entry.amount, status: 'Not Fixed - Correct category not found in target tenant', tenant: entry.tenant.name, catName: entry.category.name });
                continue;
            }

            // Check for potential collision in the target category (same month/CC/year)
            const existing = await prisma.budgetEntry.findFirst({
                where: {
                    tenantId: entry.tenantId,
                    categoryId: correctCategory.id,
                    costCenterId: entry.costCenterId,
                    month: entry.month,
                    year: entry.year
                }
            });

            if (existing) {
                // Merge amounts and remove the wrong record
                await prisma.budgetEntry.update({
                    where: { id: existing.id },
                    data: { amount: (existing.amount || 0) + (entry.amount || 0) }
                });
                await prisma.budgetEntry.delete({ where: { id: entry.id } });
                fixResults.push({ id: entry.id, amount: entry.amount, status: `Merged into existing JVS/Correct record ${existing.id}`, tenant: entry.tenant.name });
            } else {
                // Relocate to correct category
                await prisma.budgetEntry.update({
                    where: { id: entry.id },
                    data: { categoryId: correctCategory.id }
                });
                fixResults.push({ id: entry.id, amount: entry.amount, status: `Relocated to correct category ${correctCategory.id}`, tenant: entry.tenant.name });
            }
        }

        return NextResponse.json({ success: true, totalMismatched: mismatched.length, fixResults });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
