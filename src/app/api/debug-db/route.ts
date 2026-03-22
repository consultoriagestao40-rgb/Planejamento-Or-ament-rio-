import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { 
                OR: [
                    { name: { contains: 'MRV', mode: 'insensitive' } },
                    { name: { contains: 'SPOT', mode: 'insensitive' } }
                ]
            },
            select: { id: true, name: true }
        });
        
        const tenantIds = tenants.map(t => t.id);
        
        if (tenantIds.length === 0) {
            const allTenants = await prisma.tenant.findMany({ take: 10, select: { name: true } });
            return NextResponse.json({ success: true, message: 'No MRV/SPOT tenants found', sampleTenants: allTenants });
        }

        const budgets = await prisma.budgetEntry.findMany({
            where: { tenantId: { in: tenantIds }, year: 2026 },
            select: { amount: true, costCenterId: true, tenantId: true }
        });

        const ccStats = new Map<string, { amount: number, count: number }>();
        let nullCount = 0;
        let nullAmount = 0;

        budgets.forEach(b => {
                const amount = b.amount || 0;
                if (!b.costCenterId || b.costCenterId === 'DEFAULT') {
                    nullCount++;
                    nullAmount += amount;
                } else {
                    const current = ccStats.get(b.costCenterId) || { amount: 0, count: 0 };
                    ccStats.set(b.costCenterId, { 
                        amount: current.amount + amount, 
                        count: current.count + 1 
                    });
                }
        });

        const ccIds = Array.from(ccStats.keys());
        const ccs = await prisma.costCenter.findMany({
            where: { id: { in: ccIds } },
            select: { id: true, name: true, tenantId: true }
        });

        const ccResults = ccs.map(cc => {
            const stats = ccStats.get(cc.id)!;
            const tenant = tenants.find(t => t.id === cc.tenantId);
            return {
                id: cc.id,
                name: cc.name,
                tenantName: tenant?.name || 'Unknown',
                totalAmount: stats.amount,
                entryCount: stats.count
            };
        }).sort((a, b) => b.totalAmount - a.totalAmount);

        return NextResponse.json({ 
            success: true, 
            tenantsFound: tenants.map(t => t.name),
            summary: {
                totalEntries: budgets.length,
                nullCcEntries: nullCount,
                nullCcAmount: nullAmount,
                uniqueCcsWithBudgets: ccResults.length
            },
            topCcsWithBudgets: ccResults.slice(0, 100)
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
