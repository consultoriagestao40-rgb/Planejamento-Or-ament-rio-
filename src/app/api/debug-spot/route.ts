import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ 
            where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
        });

        if (!spot) return NextResponse.json({ error: "SPOT not found" });

        const { token } = await getValidAccessToken(spot.id);
        
        // TEST CONTA AZUL BRUTO FOR JAN 2026
        const start = `2026-01-01`;
        const end = `2026-01-31`;
        
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const items = (data.itens || []).filter((i:any) => !(i.status || '').toUpperCase().includes('CANCEL'));

        const dbEntries = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id, year: 2026, month: 1, viewMode: 'caixa' }
        });

        return NextResponse.json({ 
            success: true, 
            version: "0.3.11-RAW-CHECK",
            apiSummary: {
                totalValueInAPI: items.reduce((s:any, i:any) => s + (i.amount || i.valor || i.total || 0), 0),
                itemsCount: items.length,
                sampleItems: items.slice(0, 10).map((i:any) => ({
                    id: i.id,
                    desc: i.descricao,
                    amount: i.amount || i.valor || i.total,
                    cats: i.categorias?.map((c:any) => c.name)
                }))
            },
            dbSummary: {
                count: dbEntries.length,
                sum: dbEntries.reduce((s, e) => s + e.amount, 0)
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
