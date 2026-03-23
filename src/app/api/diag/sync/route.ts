import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' });

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) return NextResponse.json({ error: 'Tenant not found' });

        const envStatus = {
            hasClientId: !!process.env.CONTA_AZUL_CLIENT_ID,
            hasClientSecret: !!process.env.CONTA_AZUL_CLIENT_SECRET,
            clientIdPrefix: process.env.CONTA_AZUL_CLIENT_ID?.substring(0, 5)
        };

        const { token } = await getValidAccessToken(tenantId);
        
        const endpoints = [
            'https://api-v2.contaazul.com/v1/centros-de-custo',
            'https://api-v2.contaazul.com/v1/cost-centers',
            'https://api-v2.contaazul.com/v1/financeiro/cost-centers',
            'https://api-v2.contaazul.com/v1/financeiro/centros-de-custo'
        ];

        const results: any[] = [];
        for (const url of endpoints) {
            try {
                const res = await fetch(`${url}?tamanho_pagina=100`, { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                const text = await res.text();
                let data = null;
                try { data = JSON.parse(text); } catch(e) {}
                
                results.push({
                    url,
                    status: res.status,
                    ok: res.ok,
                    count: data ? (Array.isArray(data) ? data.length : (data.itens?.length || 0)) : 0,
                    error: res.ok ? null : text.substring(0, 100)
                });
            } catch (err: any) {
                results.push({ url, ok: false, error: err.message });
            }
        }

        const successResult = results.find(r => r.ok);
        const items = successResult ? [] : []; // We'll just report the results array
        
        return NextResponse.json({
            success: !!successResult,
            now: new Date().toISOString(),
            dbExpiresAt: tenant.tokenExpiresAt ? new Date(tenant.tokenExpiresAt).toISOString() : 'N/A',
            envStatus,
            usedTokenPrefix: token.substring(0, 10) + '...',
            endpointResults: results
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
