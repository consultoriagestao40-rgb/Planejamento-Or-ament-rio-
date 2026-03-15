import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ 
            where: { 
                name: { contains: 'SPOT', mode: 'insensitive' } 
            } 
        });
        
        if (!spot) return NextResponse.json({ success: false, error: 'SPOT not found' });

        const { token } = await getValidAccessToken(spot.id);
        if (!token) return NextResponse.json({ success: false, error: 'Failed to get CA token' });

        const year = 2026;
        const start = `${year}-01-01`;
        const end = `${year}-01-31`;

        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_pagamento_de=${start}&data_pagamento_ate=${end}&tamanho_pagina=100`;
        
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        
        const items = data.itens || [];
        const rawItems = items.map((i: any) => ({
            id: i.id,
            description: i.descricao || i.description,
            amount: i.pago || i.total || i.valor || i.amount || 0,
            categories: (i.categorias || []).map((c: any) => ({ id: c.id, name: c.nome || c.name, val: c.valor })),
            costCenters: (i.centros_de_custo || []).map((cc: any) => ({ id: cc.id, name: cc.nome || cc.name, val: cc.valor }))
        }));

        const total = rawItems.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);

        return NextResponse.json({ 
            success: true, 
            version: "0.3.0-DEBUG",
            tenant: spot.name,
            totalFound: total,
            itemsCount: rawItems.length,
            debug: {
                firstItemRaw: items[0],
                all_descriptions: rawItems.map((i: any) => `${i.description} | Valor: ${i.amount} | Pago: ${items.find((it:any) => it.id === i.id)?.pago} | Cats: ${i.categories.length}`)
            }
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
