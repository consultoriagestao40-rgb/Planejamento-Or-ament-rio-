import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || '2026');

    try {
        // 1. Get all revenue budget entries for the year
        // Revenue categories usually start with "01"
        const revenueBudgets = await prisma.budgetEntry.findMany({
            where: {
                year,
                category: {
                    name: { startsWith: '01' }
                }
            },
            include: {
                tenant: { select: { id: true, taxRate: true } }
            }
        });

        console.log(`Analyzing ${revenueBudgets.length} revenue budget entries for year ${year}`);

        // 2. Group by (tenant, costCenter, month) to calculate total revenue per unit/month
        const revenueMap: Record<string, number> = {};
        revenueBudgets.forEach(b => {
            const key = `${b.tenantId}|${b.costCenterId}|${b.month}`;
            revenueMap[key] = (revenueMap[key] || 0) + b.amount;
        });

        // 3. Find the DAS category ID for each tenant
        const tenants = await prisma.tenant.findMany({
            include: { categories: { where: { name: { contains: 'DAS' } } } }
        });

        const tenantDasMap: Record<string, string> = {};
        tenants.forEach(t => {
            const dasCat = t.categories.find(c => c.name.includes('.1.1') || c.name.includes('DAS'));
            if (dasCat) tenantDasMap[t.id] = dasCat.id;
        });

        const updates = [];
        let createdCount = 0;

        for (const [key, revAmount] of Object.entries(revenueMap)) {
            const [tenantId, costCenterId, monthStr] = key.split('|');
            const month = parseInt(monthStr);
            const tenant = tenants.find(t => t.id === tenantId);
            const dasCatId = tenantDasMap[tenantId];

            if (tenant && tenant.taxRate > 0 && dasCatId && revAmount > 0) {
                const taxAmount = revAmount * (tenant.taxRate / 100);
                
                // Ensure dasCatId is string (not null/undefined) for type safety
                const finalDasCatId: string = dasCatId!;
                updates.push(
                    prisma.budgetEntry.upsert({
                        where: {
                            tenantId_categoryId_costCenterId_month_year: {
                                tenantId,
                                categoryId: finalDasCatId,
                                costCenterId: (costCenterId === 'null' || !costCenterId) ? undefined : costCenterId,
                                month,
                                year
                            }
                        },
                        update: { amount: taxAmount },
                        create: {
                            tenantId,
                            categoryId: finalDasCatId,
                            costCenterId: (costCenterId === 'null' || !costCenterId) ? null : costCenterId,
                            month,
                            year,
                            amount: taxAmount
                        }
                    })
                );
                createdCount++;
            }
        }

        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }

        return NextResponse.json({
            success: true,
            message: `Recalculated taxes for ${createdCount} unit/month combinations.`,
            year
        });

    } catch (error: any) {
        console.error("Maintenance Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
