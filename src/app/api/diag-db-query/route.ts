import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Clean Tech Tenant not found' });
        }

        const costCenters = await prisma.costCenter.findMany({
            where: { tenantId: tenant.id }
        });

        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenant.id,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            }
        });

        // Group realized entries by costCenterId
        const ccSummary: Record<string, { name: string, total: number, count: number }> = {};
        
        // Add "None/null" group
        ccSummary['null'] = { name: 'Sem Centro de Custo', total: 0, count: 0 };
        
        costCenters.forEach(cc => {
            ccSummary[cc.id] = { name: cc.name, total: 0, count: 0 };
        });

        realizedEntries.forEach(e => {
            const ccId = e.costCenterId || 'null';
            if (!ccSummary[ccId]) {
                ccSummary[ccId] = { name: `Unknown (${ccId})`, total: 0, count: 0 };
            }
            ccSummary[ccId].total += e.amount;
            ccSummary[ccId].count += 1;
        });

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            costCenters,
            ccSummary
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
