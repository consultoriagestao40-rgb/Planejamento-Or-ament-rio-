import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId') || 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            return NextResponse.json({ error: `Tenant JVS Facilities não encontrado.` });
        }

        // 1. Refresh token if needed
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

        // 2. Fetch contas-a-pagar
        const capUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const capRes = await fetch(capUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const capData = capRes.ok ? await capRes.json() : { itens: [] };
        const capItems = Array.isArray(capData) ? capData : (capData.itens || capData.vendas || capData.data || []);

        // Find items that match 1760.16 or contain "Sefaz"
        const sefazPayments = capItems.filter((item: any) => {
            const desc = (item.descricao || item.description || '').toLowerCase();
            const total = item.valor_total || item.valor || item.total || 0;
            return desc.includes('sefaz') || Math.abs(total - 1760.16) < 0.01;
        });

        // 3. Fetch vendas to check for retentions
        const vUrl = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`;
        const vRes = await fetch(vUrl, {
            headers: { 'Authorization': `Bearer ${activeToken}` },
            cache: 'no-store'
        });
        const vData = vRes.ok ? await vRes.json() : { vendas: [] };
        const vendas = Array.isArray(vData) ? vData : (vData.itens || vData.vendas || vData.data || []);

                const sampleSales = Array.isArray(vendas) ? vendas.slice(0, 2) : [];
        
        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            contasAPagarCount: capItems.length,
            vendasCount: vendas.length,
            sampleSales,
            contasAPagar: capItems.map((p: any) => ({
                id: p.id,
                descricao: p.descricao || p.description,
                valor: p.valor || p.valor_total || p.total || p.pago,
                data_competencia: p.data_competencia || p.data,
                categoria: p.categoria || (p.categorias && p.categorias[0])
            }))
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
