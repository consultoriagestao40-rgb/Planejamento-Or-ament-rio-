
import { NextResponse } from 'next/server';
import { syncData } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';

        // Se o centro de custo não for 'DEFAULT' ou 'CC1' (Comercial), não mostramos vendas por enquanto
        // (Assumindo que vendas pertencem ao comercial/geral)
        if (costCenterId !== 'DEFAULT' && costCenterId !== 'CC1') {
            return NextResponse.json({
                success: true,
                realizedValues: {},
                raw: {}
            });
        }

        const syncResult = await syncData() as any;

        if (!syncResult.success && syncResult.error) {
            return NextResponse.json(syncResult, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            realizedValues: syncResult.realizedValues || {},
            data: syncResult
        });
    } catch (error: any) {
        console.error('Critical Sync route failure:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Fatal error during sync'
        }, { status: 500 });
    }
}
