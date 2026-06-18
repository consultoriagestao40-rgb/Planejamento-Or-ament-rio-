import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

async function aggregateRaw(accessToken: string, url: string, targetValues: Record<string, number>) {
    let pagina = 1;
    let hasMore = true;
    while (hasMore) {
        const pagedUrl = `${url}&pagina=${pagina}`;
        const res = await fetch(pagedUrl, { 
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) break;
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
        if (items.length === 0) break;
        for (const item of items) {
            const amount = item.valor_total || item.total || item.valor || item.pago || 0;
            const categories = item.categorias || (item.categoria ? [item.categoria] : []);
            if (categories.length > 0) {
                const cat = categories[0];
                const catId = cat.id || cat.categoria_id;
                const catName = cat.name || '';
                const key = `${catName}|${catId}`;
                targetValues[key] = (targetValues[key] || 0) + amount;
            }
        }
        if (items.length < 100) hasMore = false;
        pagina++;
    }
}

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const { token } = await getValidAccessToken(tenantId);
        
        const startStr = '2026-05-01';
        const endStr = '2026-05-31';
        const dateParam = 'data_competencia';

        const receiveUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`;
        const payUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`;

        const receiveValues: Record<string, number> = {};
        const payValues: Record<string, number> = {};

        await aggregateRaw(token, receiveUrl, receiveValues);
        await aggregateRaw(token, payUrl, payValues);

        return NextResponse.json({
            success: true,
            receiveValues,
            payValues
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
