import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const targetTenantId = url.searchParams.get('tenantId');
        
        const year = 2026;
        const month = 1;

        const allTenants = await prisma.tenant.findMany();
        const tenantMap = allTenants.map(t => ({ id: t.id, name: t.name }));

        const where: any = { year, month, viewMode: 'competencia' };
        if (targetTenantId) where.tenantId = targetTenantId;

        const entries = await prisma.realizedEntry.findMany({
            where,
            include: { category: true }
        });

        const breakdown: Record<string, { total: number, items: any[] }> = {};
        let totalRevenue = 0;
        let totalTaxes = 0;
        let saleRecords = 0;

        entries.forEach(e => {
            const catName = e.category?.name || 'Unknown';
            if (!breakdown[catName]) breakdown[catName] = { total: 0, items: [] };
            breakdown[catName].total += e.amount;
            breakdown[catName].items.push({
                desc: e.description,
                amt: e.amount,
                extId: e.externalId
            });

            if (catName.startsWith('01.1') || catName.startsWith('01.2') || catName.startsWith('01 ')) {
                totalRevenue += e.amount;
            }
            if (catName.startsWith('02.1') || catName.startsWith('2.1')) {
                totalTaxes += e.amount;
            }
            if (e.externalId?.startsWith('SALE-')) {
                saleRecords++;
            }
        });

        return NextResponse.json({
            success: true,
            version: '0.9.30-deep-diag',
            allTenants,
            jan2026: {
                totalRevenue,
                totalTaxes,
                saleRecords,
                entriesCount: entries.length,
                breakdown
            }
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
