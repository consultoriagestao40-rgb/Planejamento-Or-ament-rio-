
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT', mode: 'insensitive' } } });
        if (!spot) return NextResponse.json({ success: false, error: 'SPOT not found' });

        // 1. Check DB Entries (Grid Source)
        const dbEntries = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id, month: 0, year: 2026, viewMode: 'competencia' },
            include: { category: true }
        });
        const gridTotal = dbEntries.reduce((s, e) => s + e.amount, 0);

        // 2. Check API (Modal Source)
        const { token } = await getValidAccessToken(spot.id);
        const year = 2026;
        const start = `${year}-01-01`;
        const end = `${year}-01-31`;

        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        const items = data.itens || [];

        const catIdForVendas = "01.2.1"; // Need to be sure about this ID
        const apiItems = items.filter((item: any) => {
            if ((item.status || '').toUpperCase().includes('CANCEL')) return false;
            const primaryCat = item.categorias?.[0];
            return primaryCat && (primaryCat.id.includes('01.2.1') || primaryCat.name.includes('01.2.1'));
        });

        const apiTotal = apiItems.reduce((acc: number, curr: any) => acc + (curr.valor || curr.amount || curr.total || 0), 0);

        return NextResponse.json({
            success: true,
            gridTotal,
            apiTotal,
            diff: gridTotal - apiTotal,
            dbEntries: dbEntries.map(e => ({ cat: e.category.name, amount: e.amount })),
            apiItems: apiItems.map((i: any) => ({ desc: i.descricao, val: i.valor, total: i.total }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
