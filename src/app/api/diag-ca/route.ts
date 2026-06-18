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
            return NextResponse.json({ error: "CONTA_AZUL_CLIENT_ID ou SECRET ausentes." });
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
                refresh_token: tenant.refreshToken || '' 
            }),
            cache: 'no-store'
        });

        let activeToken = tenant.accessToken || '';
        if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            activeToken = tokenData.access_token;
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
                }
            });
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';

        // Buscar Vendas
        const salesRes = await fetch(`https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const salesData = salesRes.ok ? await salesRes.json() : {};
        const salesItens = salesData.itens || [];

        // Buscar Contas a Receber
        const recRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const recData = recRes.ok ? await recRes.json() : {};
        const recItens = recData.itens || [];

        // Detalhe de uma venda (Herbarium) e sua conta a receber correspondente
        const herbariumSale = salesItens.find((s: any) => s.cliente?.nome?.includes('HERBARIUM'));
        const herbariumRec = recItens.find((r: any) => r.cliente?.nome?.includes('HERBARIUM') || r.descricao?.includes('428') || r.venda_id === herbariumSale?.id);

        return NextResponse.json({
            sucesso: true,
            vendasCount: salesItens.length,
            vendasSum: salesItens.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0),
            herbariumSaleRaw: herbariumSale || null,
            herbariumRecRaw: herbariumRec || null,
            // Retornar as chaves de 1 item de conta a receber para ver o que existe nele
            sampleRecKeys: recItens.length > 0 ? Object.keys(recItens[0]) : [],
            sampleRecFull: recItens.length > 0 ? recItens[0] : null
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
