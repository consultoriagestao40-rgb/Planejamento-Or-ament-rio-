import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const jvsTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';

        // Get count of JVS realized entries for May 2026 by costCenterId format
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: jvsTenantId,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: {
                costCenter: true
            }
        });

        const summary = entries.map(e => ({
            id: e.id,
            amount: e.amount,
            costCenterId: e.costCenterId,
            costCenterName: e.costCenter ? e.costCenter.name : null
        }));

        const unprefixedCount = entries.filter(e => e.costCenterId && !e.costCenterId.includes(':')).length;
        const prefixedCount = entries.filter(e => e.costCenterId && e.costCenterId.includes(':')).length;
        const nullCount = entries.filter(e => !e.costCenterId).length;

        // Also query the cost centers in the DB that contain Penha
        const penhaCCs = await prisma.costCenter.findMany({
            where: {
                tenantId: jvsTenantId,
                name: {
                    contains: 'Penha',
                    mode: 'insensitive'
                }
            }
        });

        return NextResponse.json({
            success: true,
            totalEntries: entries.length,
            unprefixedCount,
            prefixedCount,
            nullCount,
            penhaCCs,
            sample: summary.slice(0, 10)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
