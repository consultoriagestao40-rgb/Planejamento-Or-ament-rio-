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

        // Category breakdown for Jan 2026
        const cat_breakdown: any[] = await prisma.$queryRaw`
            SELECT c.name, t.name as tenant, sum(r.amount) as total
            FROM "RealizedEntry" r
            JOIN "Category" c ON r."categoryId" = c.id
            JOIN "Tenant" t ON r."tenantId" = t.id
            WHERE r.year = 2026 AND r.month = 1
            GROUP BY c.name, t.name
            ORDER BY total DESC
        `;

        return NextResponse.json({
            success: true,
            group_totals,
            category_breakdown: cat_breakdown,
            db_distribution: stats,
            active_tenants: tenants,
            groups
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
