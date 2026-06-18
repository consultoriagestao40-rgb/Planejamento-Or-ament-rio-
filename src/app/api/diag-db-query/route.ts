import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
        
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Tenant JVS não encontrado' });
        }

        // 1. Refresh Token
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return NextResponse.json({ success: false, error: 'Credenciais Conta Azul ausentes no ambiente' });
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
        } else {
            const errText = await tokenRes.text();
            return NextResponse.json({ success: false, error: 'Falha no refresh do token', detail: errText });
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';

        // 2. Fetch Contas a Receber
        const recUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const recRes = await fetch(recUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const recData = recRes.ok ? await recRes.json() : { error: true, status: recRes.status, body: await recRes.text() };

        // 3. Fetch Vendas
        const salesUrl = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`;
        const salesRes = await fetch(salesUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const salesData = salesRes.ok ? await salesRes.json() : { error: true, status: salesRes.status, body: await salesRes.text() };

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            contasAReceber: recData,
            vendas: salesData
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
