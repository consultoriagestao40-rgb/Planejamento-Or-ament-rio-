import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const nameParam = searchParams.get('name') || 'JVS FACILITIES';
        
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: nameParam, mode: 'insensitive' } }
        });

        if (!tenant || !tenant.accessToken) {
            return NextResponse.json({ error: `Tenant ${nameParam} não possui Token válido salvo.` });
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';

        const endpoints = [
            {
                name: 'contas-a-receber',
                url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=10`
            },
            {
                name: 'contas-a-pagar',
                url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=10`
            },
            {
                name: 'vendas-busca',
                url: `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=10`
            }
        ];

        const results: Record<string, any> = {};

        for (const ep of endpoints) {
            try {
                const res = await fetch(ep.url, {
                    headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
                    cache: 'no-store'
                });
                
                if (!res.ok) {
                    results[ep.name] = {
                        status: res.status,
                        error: await res.text()
                    };
                } else {
                    const data = await res.json();
                    results[ep.name] = {
                        status: res.status,
                        data: data
                    };
                }
            } catch (err: any) {
                results[ep.name] = {
                    error: err.message
                };
            }
        }

        return NextResponse.json({
            sucesso: true,
            tenant: { id: tenant.id, name: tenant.name },
            results
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
