import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const allEntries = await prisma.budgetEntry.findMany({
            where: {
                category: { name: "05.6.1 - Pró-labore" },
                amount: { gt: 0 }
            },
            include: {
                category: { select: { tenantId: true, name: true } },
                tenant: { select: { name: true } },
                costCenter: { select: { name: true } }
            }
        });

        const report = allEntries.map(e => ({
            id: e.id,
            amount: e.amount,
            entryTenant: e.tenant.name,
            entryCC: e.costCenter?.name || 'Geral',
            categoryOwnerTenantId: e.category.tenantId,
            categoryName: e.category.name,
            month: e.month,
            year: e.year
        }));

        return NextResponse.json({ success: true, count: allEntries.length, entries: report });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
