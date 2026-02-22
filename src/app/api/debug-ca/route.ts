import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function POST(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        const pinhaisIds = new Set([
            '5efa3c38-5b2b-11f0-b1b3-8b35764fef4a',
            '3837fefa-dafd-11ee-b625-3760549ddd82',
            '3c0901f8-e337-11ef-a2c2-8bcee9109815',
            '03d27bce-b9f4-11ee-b32d-639d763ea036',
        ]);

        // Fetch ALL receivables without CC filter
        const allHits: any[] = [];
        for (let page = 1; page <= 10; page++) {
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-10-01&data_vencimento_ate=2026-03-31&tamanho_pagina=100&pagina=${page}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;

            items.forEach((item: any) => {
                if ((item.status || '').toUpperCase().includes('CANCEL')) return;
                const ccs = item.centros_de_custo || [];
                // Check if any CC on this item is a DAJU SAO JOSE DOS PINHAIS variant
                const hasCC = ccs.some((c: any) => pinhaisIds.has(c.id));
                if (!hasCC) return;

                // Check if it falls in Jan/Feb 2026 via competencia
                const compDate = item.data_competencia ? new Date(item.data_competencia) : null;
                const vencDate = item.data_vencimento ? new Date(item.data_vencimento) : null;

                allHits.push({
                    id: item.id,
                    desc: item.descricao,
                    total: item.total,
                    valor: item.valor,
                    data_competencia: item.data_competencia,
                    data_vencimento: item.data_vencimento,
                    compMonth: compDate ? `${compDate.getFullYear()}-${compDate.getMonth() + 1}` : null,
                    vencMonth: vencDate ? `${vencDate.getFullYear()}-${vencDate.getMonth() + 1}` : null,
                    ccCount: ccs.length,
                    ccs: ccs.map((c: any) => c.nome || c.id).slice(0, 5)
                });
            });

            if (items.length < 100) break;
        }

        return NextResponse.json({ success: true, count: allHits.length, items: allHits });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
