import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });
        
        const budgetCount = await prisma.budgetEntry.count({
            where: { year: 2026 }
        });

        const mrvSpotTenants = tenants.filter(t => 
            t.name.toUpperCase().includes('MRV') || 
            t.name.toUpperCase().includes('SPOT') ||
            t.name.toUpperCase().includes('FACILITIES')
        );

        return NextResponse.json({ 
            success: true, 
            totalTenants: tenants.length,
            mrvSpotTenantsInList: mrvSpotTenants,
            allTenantsSample: tenants.slice(0, 20),
            total2026Budgets: budgetCount
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
