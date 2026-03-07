import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantId = searchParams.get('tenantId') || 'ALL';

        const ccs = costCenterId.split(',').filter(id => id !== 'DEFAULT');

        // Query Cache
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenantId === 'ALL' ? undefined : tenantId,
                year,
                viewMode
            }
        });

        const aggregatedValues: Record<string, number> = {};

        for (const entry of entries) {
            // Apply Cost Center filter if needed
            if (ccs.length > 0) {
                if (!entry.costCenterId || !ccs.includes(entry.costCenterId)) {
                    continue; // Skip if it belongs to an unselected cost center
                }
            }

            const key = `${entry.categoryId}-${entry.month}`;
            aggregatedValues[key] = (aggregatedValues[key] || 0) + entry.amount;
        }

        return NextResponse.json({
            success: true,
            realizedValues: aggregatedValues,
            data: { success: true, timestamp: new Date().toISOString() } // Dummy data to satisfy frontend
        });

    } catch (error: any) {
        console.error('Critical Sync route failure:', error);
        return NextResponse.json({ success: false, error: error.message || 'Fatal error during DB read' }, { status: 500 });
    }
}

