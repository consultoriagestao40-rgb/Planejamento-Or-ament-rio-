import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function POST(request: Request) {
    try {
        const accessToken = await getValidAccessToken();
        const ccId = '3b4f447c-5b2b-11f0-a3fb-43198f0f179f'; // DAJU BARIGUI

        // Fetch ALL payables for DAJU BARIGUI in Jan AND Dec 2025 to find Simples Nacional
        const items: any[] = [];
        for (const range of [
            // Jan with vencimento window
            `data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28`,
        ]) {
            for (let i = 1; i <= 5; i++) {
                const res = await fetch(
                    `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${range}&tamanho_pagina=100&pagina=${i}&centro_custo_id=${ccId}`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                if (!res.ok) break;
                const data = await res.json();
                const pageItems = data.itens || [];
                if (pageItems.length === 0) break;
                items.push(...pageItems);
            }
        }

        // Find Simples Nacional transactions
        const simplesItems = items.filter((it: any) => {
            const cats = it.categorias || [];
            return cats.some((c: any) => c.nome?.toLowerCase().includes('simples') || c.nome?.includes('2.1.1'));
        });

        const allCats = [...new Set(items.flatMap((it: any) => (it.categorias || []).map((c: any) => `${c.id} | ${c.nome}`)))];

        return NextResponse.json({
            success: true,
            totalFound: items.length,
            simplesCount: simplesItems.length,
            simplesItems: simplesItems.map((it: any) => ({
                id: it.id,
                descricao: it.descricao,
                total: it.total,
                data_competencia: it.data_competencia,
                data_vencimento: it.data_vencimento,
                categorias: it.categorias,
                ccCount: (it.centros_de_custo || []).length
            })),
            allCats: allCats.slice(0, 30)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
