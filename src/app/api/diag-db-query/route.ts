import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const cleanTech = tenants.find(t => t.name.toUpperCase().includes('CLEAN TECH'));
        if (!cleanTech) {
            return NextResponse.json({ success: false, error: 'Clean Tech not found' });
        }

        const { token } = await getValidAccessToken(cleanTech.id);

        const url = "https://api-v2.contaazul.com/v1/venda/busca?data_inicio=2026-05-01&data_fim=2026-05-31&tamanho_pagina=100";
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ success: false, error: 'Failed to fetch sales list', details: err });
        }

        const data = await res.json();
        const sales = data.vendas || data.itens || data || [];

        const detailedSales = [];
        for (const s of sales) {
            const detailUrl = `https://api-v2.contaazul.com/v1/venda/${s.id}`;
            const detailRes = await fetch(detailUrl, {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });

            if (detailRes.ok) {
                const detailData = await detailRes.json();
                const sale = detailData.venda || detailData;
                const compVal = sale.composicao_valor || {};
                detailedSales.push({
                    id: sale.id,
                    numero: sale.numero,
                    descricao: sale.descricao,
                    total: sale.valor,
                    valor_bruto: compVal.valor_bruto || 0,
                    impostos: compVal.impostos || 0,
                    id_categoria: sale.id_categoria,
                    id_centro_custo: sale.id_centro_custo
                });
            }
        }

        return NextResponse.json({
            success: true,
            totalSalesCount: sales.length,
            detailedSales
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
