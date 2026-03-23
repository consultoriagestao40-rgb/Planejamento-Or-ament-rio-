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
        
        const ccRes = await fetch(`https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        let details = null;
        if (!ccRes.ok) {
            details = await ccRes.text();
        }

        const data = ccRes.ok ? await ccRes.json() : null;
        const items = data ? (Array.isArray(data) ? data : (data.itens || [])) : [];

        const redeTonin = items.find((item: any) => item.name.toUpperCase().includes('REDE'));
        
        return NextResponse.json({
            success: ccRes.ok,
            now: new Date().toISOString(),
            dbExpiresAt: tenant.tokenExpiresAt ? new Date(tenant.tokenExpiresAt).toISOString() : 'N/A',
            envStatus,
            usedTokenPrefix: token.substring(0, 10) + '...',
            found: redeTonin,
            errorDetails: details,
            allNames: items.map((i: any) => i.name)
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
