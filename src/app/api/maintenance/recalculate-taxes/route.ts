import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || '2026');

    try {
        const revenueBudgets = await prisma.budgetEntry.findMany({
            where: {
                year,
                category: { name: { startsWith: '01' } }
            },
            include: {
                tenant: { select: { id: true, name: true, taxRate: true } }
            }
        });

        console.log(`Analyzing ${revenueBudgets.length} revenue budget entries for year ${year}`);

        const revenueMap: Record<string, number> = {};
        revenueBudgets.forEach(b => {
            const key = `${b.tenantId}|${b.costCenterId || 'null'}|${b.month}`;
            revenueMap[key] = (revenueMap[key] || 0) + b.amount;
        });

        const tenants = await prisma.tenant.findMany({
            include: { categories: { where: { name: { contains: 'DAS' } } } }
        });

        const tenantDasMap: Record<string, string> = {};
        const tenantRateMap: Record<string, number> = {};
        const tenantNameMap: Record<string, string> = {};
        
        tenants.forEach(t => {
            const dasCat = t.categories.find(c => 
                c.name.includes('.1.1') || 
                c.name.toUpperCase().includes('DAS') ||
                c.name.toUpperCase().includes('SIMPLES NACIONAL') ||
                c.name.startsWith('02.1')
            );
            if (dasCat) tenantDasMap[t.id] = dasCat.id;
            tenantRateMap[t.id] = t.taxRate || 0;
            tenantNameMap[t.id] = t.name;
        });

        const updates = [];
        const logs: any[] = [];
        let createdCount = 0;

        for (const [key, revAmount] of Object.entries(revenueMap)) {
            const [tenantId, costCenterId, monthStr] = key.split('|');
            const month = parseInt(monthStr);
            const rate = tenantRateMap[tenantId] || 0;
            const dasCatId = tenantDasMap[tenantId];

            if (dasCatId && revAmount > 0) {
                const taxAmount = revAmount * (rate / 100);
                const finalDasCatId: string = dasCatId!;
                const finalCCId: string | null = (costCenterId === 'null' || !costCenterId) ? null : costCenterId;

                logs.push({
                    tenant: tenantNameMap[tenantId],
                    ccId: finalCCId,
                    month,
                    rev: revAmount,
                    rate: rate,
                    tax: taxAmount
                });

                updates.push(
                    prisma.budgetEntry.upsert({
                        where: {
                            tenantId_categoryId_costCenterId_month_year: {
                                tenantId,
                                categoryId: finalDasCatId,
                                costCenterId: finalCCId as any,
                                month,
                                year
                            }
                        },
                        update: { amount: taxAmount },
                        create: {
                            tenantId,
                            categoryId: finalDasCatId,
                            costCenterId: finalCCId,
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
            summary: logs.slice(0, 10), // Return first 10 for debug
            totalAffected: createdCount,
            year
        });

    } catch (error: any) {
        console.error("Maintenance Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
