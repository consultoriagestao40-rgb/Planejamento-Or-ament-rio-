import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

async function fetchAll(url: string, token: string) {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return { error: res.status, url };
    return await res.json();
}

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } }
        });

        if (tenants.length === 0) return NextResponse.json({ error: 'No SPOT tenants found' });

        const results: any[] = [];

        for (const tenant of tenants) {
            const { token } = await getValidAccessToken(tenant.id);
            
            const year = 2026;
            const startStr = `${year}-01-01`;
            const endStr = `${year}-01-31`;

            const endpoints = [
                { name: 'Recebíveis (Competência)', url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100` },
                { name: 'Outras Receitas', url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/outras-receitas/buscar?data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100` },
                { name: 'Outros Recebimentos', url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/outros-recebimentos/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100` },
                { name: 'Vendas', url: `https://api-v2.contaazul.com/v1/vendas?data_inicio=${startStr}&data_fim=${endStr}` }
            ];

            const tenantResults: any = { tenant: tenant.name, data: {} };

            for (const ep of endpoints) {
                const data = await fetchAll(ep.url, token);
                tenantResults.data[ep.name] = {
                    count: data.itens?.length || data.length || 0,
                    total: (data.itens || []).reduce((acc: number, i: any) => acc + (i.valor || i.total || i.valor_total || 0), 0),
                    items: (data.itens || []).map((i: any) => ({ desc: i.descricao || i.numero || i.id, val: i.valor || i.total || i.valor_total || 0, date: i.data_competencia || i.data_vencimento || i.data_emissao }))
                };
            }
            results.push(tenantResults);
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
