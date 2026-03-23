import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' });

        const { token, tenant } = await getValidAccessToken(tenantId);
        
        const endpoints = [
            'https://api-v2.contaazul.com/v1/categorias',
            'https://api-v2.contaazul.com/v1/centros-de-custo',
            'https://api-v2.contaazul.com/v1/financeiro/categorias',
            'https://api-v2.contaazul.com/v1/financeiro/centros-de-custo',
            'https://api-v2.contaazul.com/v1/cost-centers',
            'https://api-v2.contaazul.com/v1/categories'
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
                    total: data ? (Array.isArray(data) ? data.length : (data.itens?.length || data.total || 0)) : 0,
                    errorSnippet: res.ok ? null : text.substring(0, 150),
                    firstItemName: data && (data.itens ? data.itens[0]?.name : data[0]?.name)
                });
            } catch (err: any) {
                results.push({ url, ok: false, error: err.message });
            }
        }

        return NextResponse.json({
            success: results.some(r => r.ok),
            dbExpiresAt: tenant.tokenExpiresAt ? new Date(tenant.tokenExpiresAt).toISOString() : 'N/A',
            endpointResults: results
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
