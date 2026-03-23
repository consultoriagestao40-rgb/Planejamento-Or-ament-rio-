import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' });

        const { token } = await getValidAccessToken(tenantId);
        
        const ccRes = await fetch(`https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (!ccRes.ok) {
            const err = await ccRes.text();
            return NextResponse.json({ success: false, error: 'CA Error', details: err });
        }

        const data = await ccRes.json();
        const items = Array.isArray(data) ? data : (data.itens || []);

        const redeTonin = items.find((item: any) => item.name.includes('REDE') || item.id.includes('v55')); // Search for REDE
        
        return NextResponse.json({
            success: true,
            total: items.length,
            found: redeTonin,
            allNames: items.map((i: any) => i.name)
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
