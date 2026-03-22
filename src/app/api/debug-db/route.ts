import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spotTenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26';
        const year = 2026;
        const month = 1;

        // Query ALL tenants so we can find cross-tenant leaks
        const entries = await prisma.realizedEntry.findMany({
            where: { year, month },
            include: { category: true, costCenter: true, tenant: true }
        });

        let spotRevenue = 0;
        let otherRevenue = 0;
        const byTenant: Record<string, number> = {};

        entries.forEach(e => {
            const catName = e.category?.name || '';
            const isRevenue = catName.startsWith('01');
            const tenantName = e.tenant?.name || e.tenantId;

            if (!byTenant[tenantName]) byTenant[tenantName] = 0;
            if (isRevenue) {
                byTenant[tenantName] += e.amount;
                if (e.tenantId === spotTenantId) spotRevenue += e.amount;
                else otherRevenue += e.amount;
            }
        });

        const totalCount = entries.length;
        const spotCount = entries.filter(e => e.tenantId === spotTenantId).length;

        return NextResponse.json({
            success: true,
            totalCount,
            spotCount,
            spotRevenue,
            otherRevenue,
            byTenant,
            totalEntries: entries.length
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
