import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const mrvTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'MRV' } },
            select: { id: true, name: true }
        });
        
        const tenantIds = mrvTenants.map(t => t.id);
        
        // 1. Get all budgets for these tenants in 2026
        const budgets = await prisma.budgetEntry.findMany({
            where: { tenantId: { in: tenantIds }, year: 2026 },
            select: { amount: true, costCenterId: true }
        });

        // 2. Sum by costCenterId
        const ccStats = new Map<string, number>();
        let nullCount = 0;
        let nullAmount = 0;

        budgets.forEach(b => {
            if (!b.costCenterId || b.costCenterId === 'DEFAULT') {
                nullCount++;
                nullAmount += b.amount || 0;
            } else {
                ccStats.set(b.costCenterId, (ccStats.get(b.costCenterId) || 0) + (b.amount || 0));
            }
        });

        // 3. Get Names for these CCs
        const ccIds = Array.from(ccStats.keys());
        const ccs = await prisma.costCenter.findMany({
            where: { id: { in: ccIds } },
            select: { id: true, name: true }
        });

        const ccResults = ccs.map(cc => ({
            id: cc.id,
            name: cc.name,
            totalAmount: ccStats.get(cc.id) || 0
        })).sort((a, b) => b.totalAmount - a.totalAmount);

        return NextResponse.json({ 
            success: true, 
            tenants: mrvTenants,
            summary: {
                totalEntries: budgets.length,
                nullCcEntries: nullCount,
                nullCcAmount: nullAmount,
                uniqueCcsWithBudgets: ccResults.length
            },
            topCcsWithBudgets: ccResults.slice(0, 50)
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
