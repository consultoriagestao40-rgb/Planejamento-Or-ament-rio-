
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

        const data = await syncData();

        const realizedValues: Record<string, number> = {};

        // V19.3: Temporariamente desativando processamento de vendas
        // O foco agora é na importação do Plano de Contas e Centros de Custo.
        /*
        if (data.sales && Array.isArray(data.sales)) {
            data.sales.forEach((sale: any) => {
                if (!sale.emission_date) return;

                const date = new Date(sale.emission_date);
                const monthIndex = date.getMonth();
                const year = date.getFullYear();
                const currentYear = new Date().getFullYear();

                if (year === currentYear) {
                    let finalCategoryId = "1.1";
                    const key = `${finalCategoryId}-${monthIndex}`;
                    realizedValues[key] = (realizedValues[key] || 0) + sale.value;
                }
            });
        }
        */

        return NextResponse.json({
            success: true,
            realizedValues,
            raw: data // Send raw for debug if needed
        });
    } catch (error: any) {
        console.error('Sync error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to sync data'
        }, { status: 500 });
    }
}
