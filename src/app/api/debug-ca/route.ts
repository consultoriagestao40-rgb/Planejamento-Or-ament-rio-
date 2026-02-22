import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId');

        const accessToken = await getValidAccessToken();
        let total = 0;
        let matches = 0;
        let ccsEncontrados: any = {};

        for (let i = 1; i <= 20; i++) {
            let url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100&pagina=${i}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;

            items.forEach((item: any) => {
                total++;
                const ccs = item.centros_de_custo || [];
                if (ccs.length > 0) {
                    const id = ccs[0].id;
                    const nome = ccs[0].nome;
                    ccsEncontrados[nome] = (ccsEncontrados[nome] || 0) + 1;
                    if (id === costCenterId) matches++;
                }
            });
        }

        return NextResponse.json({
            success: true,
            total_analisados: total,
            matches_procurados: matches,
            ccsEncontrados: ccsEncontrados
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
