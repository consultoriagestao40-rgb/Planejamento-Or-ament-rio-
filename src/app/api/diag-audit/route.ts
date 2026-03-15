import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        if (!spot) return NextResponse.json({ error: 'SPOT not found' });

        const { token } = await getValidAccessToken(spot.id);
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        
        const targetItems = (data.itens || []).filter((i: any) => 
            i.descricao.includes('657') || 
            i.descricao.includes('614') || 
            i.descricao.includes('649') ||
            i.descricao.includes('643')
        );

        return NextResponse.json({
            meta: "Dumping full JSON for debugging calculations",
            items: targetItems
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
