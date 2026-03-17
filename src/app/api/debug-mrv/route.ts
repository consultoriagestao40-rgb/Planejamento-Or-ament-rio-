import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups, getPrimaryTenantId } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats: any[] = await prisma.$queryRaw`
            SELECT "tenantId", "viewMode", count(*)::text as count, sum(amount) as total 
            FROM "RealizedEntry" 
            WHERE year = 2026 
            GROUP BY "tenantId", "viewMode"
        `;

        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const groups = await getTenantGroups();

        // Calculate consolidated totals per group based on the logic
        const group_totals: any = {};
        for (const row of stats) {
            const group = groups.find(g => g.includes(row.tenantId));
            const primaryId = group ? group[0] : row.tenantId;
            const tenantObj = tenants.find(t => t.id === primaryId);
            const name = tenantObj ? tenantObj.name : primaryId;
            const key = `${name} | ${row.viewMode}`;
            
            if (!group_totals[key]) group_totals[key] = { count: 0, total: 0 };
            group_totals[key].count += parseInt(row.count, 10);
            group_totals[key].total += parseFloat(row.total || 0);
        }

        // Sample of Jan 2026 for first group
        const sample = await prisma.realizedEntry.findMany({
            where: { year: 2026, month: 1 },
            take: 10,
            include: { category: { select: { name: true } } }
        });

        return NextResponse.json({
            success: true,
            group_totals,
            db_distribution: stats,
            active_tenants: tenants,
            groups,
            sample_jan_2026: sample
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
