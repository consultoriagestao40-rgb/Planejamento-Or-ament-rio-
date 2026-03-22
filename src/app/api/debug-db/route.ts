import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantIds = [
            "413f88a7-ce4a-4620-b044-43ef909b7b26", // SPOT FACILITIES
            "dc2b6eed-a38a-43c3-9465-ce854bfda90f"  // JVS FACILITIES
        ];

        // 1. Get ALL Cost Center names that have budgets in these tenants
        const budgets = await prisma.budgetEntry.findMany({
            where: { tenantId: { in: tenantIds }, year: 2026 },
            select: { costCenterId: true, amount: true }
        });

        const ccIdsWithBudget = Array.from(new Set(budgets.map(b => b.costCenterId).filter(Boolean) as string[]));
        
        const ccNames = await prisma.costCenter.findMany({
            where: { id: { in: ccIdsWithBudget } },
            select: { id: true, name: true }
        });

        const nameStats = ccNames.map(cc => {
            const amount = budgets.filter(b => b.costCenterId === cc.id).reduce((s, b) => s + (b.amount || 0), 0);
            return { name: cc.name, amount };
        }).sort((a, b) => b.amount - a.amount);

        // 2. Search for any CC containing "BRASIL" or "JOHN KENNEDY"
        const searchCcs = await prisma.costCenter.findMany({
            where: {
                tenantId: { in: tenantIds },
                OR: [
                    { name: { contains: 'BRASIL', mode: 'insensitive' } },
                    { name: { contains: 'JOHN KENNEDY', mode: 'insensitive' } },
                    { name: { contains: 'FATEC', mode: 'insensitive' } }
                ]
            },
            include: {
                _count: {
                    select: { budgets: { where: { year: 2026 } } }
                }
            }
        });

        return NextResponse.json({ 
            success: true, 
            uniqueNamesWithBudgets: nameStats.length,
            topNames: nameStats.slice(0, 50),
            specificSearch: searchCcs.map(cc => ({
                id: cc.id,
                name: cc.name,
                budgetCount2026: cc._count.budgets
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
