import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function POST(request: Request) {
    try {
        const accessToken = await getValidAccessToken();
        const ccId = '3b4f447c-5b2b-11f0-a3fb-43198f0f179f'; // DAJU BARIGUI

        // Fetch all Jan payables filtered by DAJU BARIGUI
        const items: any[] = [];
        for (let i = 1; i <= 10; i++) {
            const res = await fetch(
                `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100&pagina=${i}&centro_custo_id=${ccId}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            if (!res.ok) break;
            const data = await res.json();
            const pageItems = data.itens || [];
            if (pageItems.length === 0) break;
            items.push(...pageItems);
        }

        // Group by number of cost centers
        const singleCC = items.filter((it: any) => (it.centros_de_custo || []).length === 1);
        const multiCC = items.filter((it: any) => (it.centros_de_custo || []).length > 1);

        return NextResponse.json({
            success: true,
            totalFound: items.length,
            singleCCCount: singleCC.length,
            multiCCCount: multiCC.length,
            singleCCSample: singleCC.slice(0, 5).map((it: any) => ({
                id: it.id,
                descricao: it.descricao,
                total: it.total,
                categorias: it.categorias,
                ccCount: (it.centros_de_custo || []).length
            })),
            multiCCSample: multiCC.slice(0, 5).map((it: any) => ({
                id: it.id,
                descricao: it.descricao,
                total: it.total,
                categorias: it.categorias,
                ccCount: (it.centros_de_custo || []).length
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
