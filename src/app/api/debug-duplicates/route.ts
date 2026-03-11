import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        
        // Find entries grouped to see if there are multiple entries for same Cat/CC/Month
        const grouping = await prisma.realizedEntry.groupBy({
            by: ['categoryId', 'costCenterId', 'month', 'year', 'viewMode'],
            where: { tenantId, year: 2026, month: 0 },
            _count: { _all: true },
            _sum: { amount: true },
            having: {
                id: {
                    _count: { gt: 1 }
                }
            }
        });

        const details = [];
        for (const group of grouping) {
             const items = await prisma.realizedEntry.findMany({
                 where: {
                     tenantId,
                     categoryId: group.categoryId,
                     costCenterId: group.costCenterId,
                     month: group.month,
                     year: group.year,
                     viewMode: group.viewMode
                 },
                 include: { category: true, costCenter: true }
             });
             details.push({
                 group,
                 items: items.map(i => ({ id: i.id, amount: i.amount, cat: i.category.name, cc: i.costCenter?.name || 'NONE' }))
             });
        }

        return NextResponse.json({
            success: true,
            has_duplicates: grouping.length > 0,
            duplicated_groups_count: grouping.length,
            duplicates: details
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
