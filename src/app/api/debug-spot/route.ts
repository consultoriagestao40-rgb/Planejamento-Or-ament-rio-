
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/contaazul';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT', mode: 'insensitive' } } });
        if (!spot) return NextResponse.json({ success: false, error: 'SPOT not found' });

        const token = await getAccessToken(spot.id);
        if (!token) return NextResponse.json({ success: false, error: 'Failed to get CA token' });

        const year = 2026;
        const start = `${year}-01-01`;
        const end = `${year}-01-31`;

        // Fetching "Contas a Receber" specifically
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;
        
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        
        const items = data.items || [];
        const rawItems = items.map((i: any) => ({
            id: i.id,
            description: i.description,
            amount: i.amount,
            categories: i.categories.map((c: any) => ({ name: c.name, val: c.valor })),
            costCenters: i.costCenters.map((cc: any) => ({ name: cc.name, val: cc.valor }))
        }));

        const total = rawItems.reduce((acc, curr) => acc + curr.amount, 0);

        return NextResponse.json({ 
            success: true, 
            tenant: spot.name,
            totalFound: total,
            items: rawItems
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
