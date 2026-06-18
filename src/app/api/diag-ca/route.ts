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

        if (!tenant) {
            return NextResponse.json({ error: `Tenant ${nameParam} não encontrado.` });
        }

        // 1. Tentar forçar o refresh do token manualmente
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
            return NextResponse.json({ 
                error: "CONTA_AZUL_CLIENT_ID ou SECRET ausentes nas variáveis de ambiente do Vercel.",
                envKeys: Object.keys(process.env).filter(k => k.includes('CONTA_AZUL') || k.includes('PORT'))
            });
        }

        if (!tenant.refreshToken) {
            return NextResponse.json({ error: "Tenant não possui refreshToken no banco." });
        }

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const tokenRes = await fetch('https://auth.contaazul.com/oauth2/token', {
            method: 'POST',
            headers: { 
                'Authorization': `Basic ${auth}`, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            },
            body: new URLSearchParams({ 
                grant_type: 'refresh_token', 
                refresh_token: tenant.refreshToken 
            }),
            cache: 'no-store'
        });

        let refreshResult: any = null;
        let activeToken = tenant.accessToken || '';

        if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            refreshResult = {
                success: true,
                expires_in: tokenData.expires_in
            };
            activeToken = tokenData.access_token;
            
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
                }
            });
        } else {
            const errText = await tokenRes.text();
            refreshResult = {
                success: false,
                status: tokenRes.status,
                body: errText
            };
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';
        const year = 2026;

        // 2. Fazer requisições usando o token com parâmetros corrigidos
        const recUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const recRes = await fetch(recUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const recData = recRes.ok ? await recRes.json() : { error: true, status: recRes.status, body: await recRes.text() };

        const pagUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const pagRes = await fetch(pagUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const pagData = pagRes.ok ? await pagRes.json() : { error: true, status: pagRes.status, body: await pagRes.text() };

        const salesUrl = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`;
        const salesRes = await fetch(salesUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const salesData = salesRes.ok ? await salesRes.json() : { error: true, status: salesRes.status, body: await salesRes.text() };

        // Processar itens detalhadamente
        const recItens = recData.itens || [];
        const pagItens = pagData.itens || [];
        const salesItens = salesData.itens || salesData.vendas || [];

        return NextResponse.json({
            sucesso: true,
            tenant: { id: tenant.id, name: tenant.name },
            refreshResult,
            apiUrls: { recUrl, pagUrl, salesUrl },
            apiResponses: {
                contas_a_receber: {
                    count: recItens.length,
                    total_sum: recItens.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0),
                    original_sum: recItens.reduce((acc: number, curr: any) => acc + (curr.valor_original || 0), 0),
                    liquido_sum: recItens.reduce((acc: number, curr: any) => acc + (curr.valor_liquido || 0), 0),
                    items: recItens.map((item: any) => ({
                        id: item.id,
                        descricao: item.descricao,
                        total: item.total,
                        valor_original: item.valor_original,
                        valor_liquido: item.valor_liquido,
                        categoria: item.categorias?.[0]?.nome,
                        venda_id: item.venda_id,
                        retencoes: item.retencoes
                    }))
                },
                contas_a_pagar: {
                    count: pagItens.length,
                    total_sum: pagItens.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0),
                    items: pagItens.map((item: any) => ({
                        id: item.id,
                        descricao: item.descricao,
                        total: item.total,
                        categoria: item.categorias?.[0]?.nome,
                        fornecedor: item.fornecedor?.nome
                    }))
                },
                vendas: {
                    count: salesItens.length,
                    total_sum: salesItens.reduce((acc: number, curr: any) => acc + (curr.total || curr.valor_total || 0), 0),
                    items: salesItens.map((item: any) => ({
                        id: item.id,
                        numero: item.numero,
                        total: item.total,
                        situacao: item.situacao?.nome,
                        cliente: item.cliente?.nome
                    }))
                }
            }
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message, stack: e.stack });
    }
}
