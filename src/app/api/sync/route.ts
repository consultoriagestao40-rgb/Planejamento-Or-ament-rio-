
import { NextResponse } from 'next/server';
import { syncData } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';
        const year = parseInt(searchParams.get('year') || '2026', 10);

        // V47.10: Removed blocking logic for non-default CCs.
        // We now pass the CC ID down to the service to filter at the API level.

        const syncResult = await syncData(costCenterId, year) as any;

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
