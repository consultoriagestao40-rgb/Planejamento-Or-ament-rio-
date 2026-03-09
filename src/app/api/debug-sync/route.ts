import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { accessToken: { not: null } }
        });

        const results: any[] = [];

        for (const tenant of tenants) {
            if (!tenant.name.includes("JVS FACILITIES")) continue;
            
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 5) { // Search up to 5 pages
                const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100&pagina=${page}`;

                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
                    cache: 'no-store'
                });

                if (!res.ok) { hasMore = false; break; }

                const body = await res.json();
                const items = body.itens || [];
                if (items.length === 0) { hasMore = false; break; }

                const matchingTotal = items.filter((i: any) => {
                    const val = i.valor || i.total || i.valor_original;
                    // match specific rateio or title
                    return (val >= 5740 && val <= 5750) || (i.descricao && i.descricao.includes('VT'));
                });

                if (matchingTotal.length > 0) {
                    results.push({
                        tenant: tenant.name,
                        page,
                        transactions: matchingTotal.map((t: any) => ({
                            id: t.id,
                            desc: t.descricao,
                            total: t.valor || t.total,
                            ccs: t.centros_de_custo
                        }))
                    });
                }
                
                page++;
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
