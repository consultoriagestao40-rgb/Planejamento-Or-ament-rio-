import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const nameParam = searchParams.get('name') || 'JVS FACILITIES';
        
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: nameParam, mode: 'insensitive' } },
            select: { id: true, name: true, cnpj: true, taxRate: true }
        });

        if (!tenant) {
            return NextResponse.json({ error: `Tenant ${nameParam} não encontrado.` });
        }

        // Buscar as contas a pagar da categoria de imposto DAS no mês de Maio/2026
        const startStr = '2026-05-01';
        const endStr = '2026-05-31';

        // 1. Refresh do Token para buscar na API do Conta Azul
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        let activeToken = '';
        if (clientId && clientSecret) {
            const t = await prisma.tenant.findUnique({ where: { id: tenant.id } });
            const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const tokenRes = await fetch('https://auth.contaazul.com/oauth2/token', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t?.refreshToken || '' }),
                cache: 'no-store'
            });
            if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                activeToken = tokenData.access_token;
            }
        }

        let apiDasEntries = [];
        if (activeToken) {
            // Buscar todas as contas a pagar da competência de Maio
            let pagina = 1;
            let hasMore = true;
            const pags = [];
            while (hasMore) {
                const res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&pagina=${pagina}&tamanho_pagina=100`, {
                    headers: { 'Authorization': `Bearer ${activeToken}` },
                    cache: 'no-store'
                });
                if (res.ok) {
                    const data = await res.json();
                    const pageItems = data.itens || [];
                    if (pageItems.length === 0) break;
                    pags.push(...pageItems);
                    if (pageItems.length < 100) hasMore = false;
                    pagina++;
                } else {
                    break;
                }
            }
            apiDasEntries = pags.filter((p: any) => 
                p.categorias?.some((c: any) => c.nome?.includes('DAS') || c.nome?.includes('2.1.1'))
            ).map((p: any) => ({
                descricao: p.descricao,
                total: p.total,
                competencia: p.data_competencia,
                categoria: p.categorias?.[0]?.nome
            }));
        }

        return NextResponse.json({
            sucesso: true,
            tenant,
            apiDasEntries
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
