import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const year = 2026;
        const month = 5;

        // Get count and sum of all entries for May 2026 grouped by tenant and viewMode
        const summary = await prisma.realizedEntry.groupBy({
            by: ['tenantId', 'viewMode'],
            where: { year, month },
            _count: true,
            _sum: { amount: true }
        });

        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const tenantMap = new Map(tenants.map(t => [t.id, t.name]));

        const results = summary.map(s => ({
            tenantId: s.tenantId,
            tenantName: tenantMap.get(s.tenantId) || 'Desconhecido',
            viewMode: s.viewMode,
            count: s._count,
            totalAmount: s._sum.amount
        }));

        // Get details of realized entries for JVS Facilities (dc2b6eed-a38a-43c3-9465-ce854bfda90f) in May 2026 grouped by category
        const jvsCategories = await prisma.realizedEntry.groupBy({
            by: ['categoryId', 'viewMode'],
            where: { tenantId: 'dc2b6eed-a38a-43c3-9465-ce854bfda90f', year, month },
            _sum: { amount: true },
            orderBy: { _sum: { amount: 'desc' } }
        });

        const categories = await prisma.category.findMany({
            select: { id: true, name: true }
        });
        const catMap = new Map(categories.map(c => [c.id, c.name]));

        const jvsReport = jvsCategories.map(jc => ({
            categoryId: jc.categoryId,
            categoryName: catMap.get(jc.categoryId) || jc.categoryId,
            viewMode: jc.viewMode,
            total: jc._sum.amount
        }));

        return NextResponse.json({
            success: true,
            summary: results,
            jvsReport
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
