import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function decodeJwt(token: string | null) {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = Buffer.from(parts[1], 'base64').toString('utf8');
        return JSON.parse(payload);
    } catch (e) {
        return null;
    }
}

import { getValidAccessToken } from '@/lib/services';

export async function GET() {
    try {
        const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT FACILITIES
        const { token } = await getValidAccessToken(tenantId);
        
        const startStr = '2026-05-01';
        const endStr = '2026-05-31';
        
        // 1. Fetch contas-a-receber (competência)
        const crUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const crRes = await fetch(crUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const crData = crRes.ok ? await crRes.json() : { error: true, status: crRes.status, body: await crRes.text() };
        
        // 2. Fetch vendas
        const vUrl = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`;
        const vRes = await fetch(vUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const vData = vRes.ok ? await vRes.json() : { error: true, status: vRes.status, body: await vRes.text() };
        
        return NextResponse.json({
            success: true,
            crUrl,
            vUrl,
            contasAReceber: crRes.ok ? {
                count: (crData.itens || crData || []).length,
                total_sum: (crData.itens || crData || []).reduce((acc: number, curr: any) => acc + (curr.valor_total || curr.valor || curr.total || 0), 0),
                valor_sum: (crData.itens || crData || []).reduce((acc: number, curr: any) => acc + (curr.valor || 0), 0),
                valor_total_sum: (crData.itens || crData || []).reduce((acc: number, curr: any) => acc + (curr.valor_total || 0), 0),
                sample: (crData.itens || crData || []).slice(0, 5)
            } : crData,
            vendas: vRes.ok ? {
                count: (vData.itens || vData.vendas || vData || []).length,
                total_sum: (vData.itens || vData.vendas || vData || []).reduce((acc: number, curr: any) => acc + (curr.valor_total || curr.total || curr.valor || 0), 0),
                sample: (vData.itens || vData.vendas || vData || []).slice(0, 5)
            } : vData
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
