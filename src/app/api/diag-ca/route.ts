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

        // 1. Refresh do Token
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return NextResponse.json({ error: "Credenciais Conta Azul ausentes." });
        }

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenRes = await fetch('https://auth.contaazul.com/oauth2/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tenant.refreshToken || '' }),
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

        // 2. Buscar Notas Fiscais de Serviço (NFS-e) do período
        const nfsUrl = `https://api-v2.contaazul.com/v1/fiscal/servicos/notas-fiscais?data_emissao_de=${startStr}&data_emissao_ate=${endStr}&tamanho_pagina=100`;
        const nfsRes = await fetch(nfsUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const nfsData = nfsRes.ok ? await nfsRes.json() : { error: true, status: nfsRes.status, body: await nfsRes.text() };
        const nfsItems = nfsData.itens || nfsData || [];

        return NextResponse.json({
            sucesso: true,
            tenant: { id: tenant.id, name: tenant.name },
            nfsUrl,
            nfsResponse: nfsRes.ok ? {
                count: nfsItems.length,
                total_sum: nfsItems.reduce((acc: number, curr: any) => acc + (curr.valor_total || curr.valor || curr.total || 0), 0),
                sample: nfsItems.slice(0, 3)
            } : nfsData
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
