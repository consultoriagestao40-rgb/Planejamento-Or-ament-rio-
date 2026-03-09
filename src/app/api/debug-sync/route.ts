import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { accessToken: { not: null, not: 'test-token' } }
        });

        const results: any[] = [];

        for (const tenant of tenants) {
            if (!tenant.name.includes("JVS FACILITIES")) continue;
            
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100`;

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
                cache: 'no-store'
            });

            if (!res.ok) continue;

            const body = await res.json();
            const items = body.itens || [];
            
            // Look for total value ~5744
            const matchingTotal = items.filter((i: any) => {
                const val = i.valor || i.total || i.valor_original;
                return val >= 5740 && val <= 5750;
            });

            if (matchingTotal.length > 0) {
                results.push({
                    tenant: tenant.name,
                    transactions: matchingTotal.map((t: any) => ({
                        desc: t.descricao,
                        total: t.valor || t.total,
                        date: t.data_vencimento || t.vencimento,
                        ccs: t.centros_de_custo
                    }))
                });
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
