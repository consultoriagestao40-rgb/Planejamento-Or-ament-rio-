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

        const revenueMap: Record<string, number> = {};
        revenueBudgets.forEach(b => {
            const key = `${b.tenantId}|${b.costCenterId || 'null'}|${b.month}`;
            revenueMap[key] = (revenueMap[key] || 0) + b.amount;
        });

        const tenants = await prisma.tenant.findMany({
            include: { categories: true }
        });

        const tenantDasMap: Record<string, string> = {};
        const tenantRateMap: Record<string, number> = {};
        const tenantNameMap: Record<string, string> = {};
        const allTaxCatIds: string[] = [];
        
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

            // Collect ALL tax-like category IDs for deletion
            t.categories.forEach(c => {
               const n = c.name.toUpperCase();
               if (n.includes('DAS') || n.includes('IMPOSTO') || n.includes('TRIBUTO') || c.name.startsWith('02.1')) {
                   allTaxCatIds.push(c.id);
               }
            });
        });

        // --- DESTRUCTIVE CLEANUP ---
        if (allTaxCatIds.length > 0) {
            const del = await prisma.budgetEntry.deleteMany({
                where: {
                    year,
                    categoryId: { in: allTaxCatIds }
                }
            });
            console.log(`[CLEANUP] Deleted ${del.count} potentially duplicate tax entries.`);
        }

        const entriesToCreate = [];
        const logs: any[] = [];

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

                entriesToCreate.push({
                    tenantId,
                    categoryId: finalDasCatId,
                    costCenterId: finalCCId,
                    month,
                    year,
                    amount: taxAmount,
                    isLocked: false,
                    observation: 'Recalculado automaticamente (v64.0.1)'
                });
            }
        }

        if (entriesToCreate.length > 0) {
            await prisma.budgetEntry.createMany({
                data: entriesToCreate as any
            });
        }

        return NextResponse.json({
            success: true,
            summary: logs.slice(0, 10),
            totalAffected: entriesToCreate.length,
            year
        });

    } catch (error: any) {
        console.error("Maintenance Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
