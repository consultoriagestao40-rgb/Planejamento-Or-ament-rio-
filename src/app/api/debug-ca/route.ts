import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function POST(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        // All CC IDs that may correspond to "DAJU SAO JOSE DOS PINHAIS"
        const ccIds = [
            { id: '5efa3c38-5b2b-11f0-b1b3-8b35764fef4a', name: 'DAJU SAO JOSE DOS PINHAIS' },
            { id: '3837fefa-dafd-11ee-b625-3760549ddd82', name: 'DAJU SÃO JOSE  DOS PINHAIS' },
            { id: '3c0901f8-e337-11ef-a2c2-8bcee9109815', name: 'DAJU SÃO JOSE DOS PINHAIS' },
            { id: '03d27bce-b9f4-11ee-b32d-639d763ea036', name: 'Daju São José dos Pinhais' },
        ];

        const results: any[] = [];

        for (const cc of ccIds) {
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-10-01&data_vencimento_ate=2026-03-31&tamanho_pagina=100&pagina=1&centro_custo_id=${cc.id}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) { results.push({ ...cc, error: res.status }); continue; }
            const data = await res.json();
            const items = (data.itens || []).filter((it: any) => !(it.status || '').toUpperCase().includes('CANCEL'));

            // Find Jan/Feb items
            const janFebItems = items.filter((it: any) => {
                const d = it.data_competencia || it.data_vencimento;
                const date = d ? new Date(d) : null;
                return date && date.getFullYear() === 2026 && (date.getMonth() === 0 || date.getMonth() === 1);
            });

            results.push({
                ...cc,
                totalItems: items.length,
                janFebCount: janFebItems.length,
                janFebTotal: janFebItems.reduce((s: number, it: any) => s + (it.total || it.valor || 0), 0),
                janFebSample: janFebItems.slice(0, 5).map((it: any) => ({
                    desc: it.descricao,
                    comp: it.data_competencia,
                    venc: it.data_vencimento,
                    total: it.total,
                    valor: it.valor,
                    ccCount: (it.centros_de_custo || []).length,
                    ccs: (it.centros_de_custo || []).map((c: any) => c.nome || c.id)
                }))
            });
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
