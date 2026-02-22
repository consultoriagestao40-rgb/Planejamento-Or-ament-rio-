
import { NextResponse } from 'next/server';
import { syncData } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';
        const year = parseInt(searchParams.get('year') || '2026', 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantId = searchParams.get('tenantId') || 'ALL';

        const { prisma } = await import('@/lib/prisma');
        const tenants = tenantId === 'ALL'
            ? await prisma.tenant.findMany()
            : await prisma.tenant.findMany({ where: { id: tenantId } });

        if (tenants.length === 0) {
            return NextResponse.json({ success: false, error: 'Nenhuma empresa conectada', realizedValues: {} }, { status: 400 });
        }

        const aggregatedValues: Record<string, number> = {};
        let someSuccess = false;
        const reports: any[] = [];

        for (const t of tenants) {
            const syncResult = await syncData(costCenterId, year, viewMode, t.id) as any;

            if (syncResult.success) {
                someSuccess = true;
                // Aggregate realized values
                if (syncResult.realizedValues) {
                    for (const [key, value] of Object.entries(syncResult.realizedValues)) {
                        aggregatedValues[key] = (aggregatedValues[key] || 0) + (value as number);
                    }
                }
            }

            reports.push({ tenant: t.name, result: syncResult });
        }

        if (!someSuccess) {
            return NextResponse.json({ success: false, error: 'Falha ao sincronizar todas as empresas', reports }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            realizedValues: aggregatedValues,
            // Return first successful data for things like categories list
            data: reports.find(r => r.result.success)?.result || reports[0].result,
            reports // keep for debugging
        });
    } catch (error: any) {
        console.error('Critical Sync route failure:', error);
        return NextResponse.json({ success: false, error: error.message || 'Fatal error during sync' }, { status: 500 });
    }
}
