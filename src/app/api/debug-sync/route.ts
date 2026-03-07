import { NextResponse } from 'next/server';
import { runCronSync } from '@/lib/cronSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const paramYear = searchParams.get('year');
        const reqYear = paramYear ? parseInt(paramYear, 10) : new Date().getFullYear();

        console.log(`[DEBUG] Starting debug sync for year ${reqYear}`);
        const { prisma } = await import('@/lib/prisma');
        const { getValidAccessToken } = await import('@/lib/services');
        const tenants = await prisma.tenant.findMany();
        const t = tenants[0];
        const res = await getValidAccessToken(t.id);
        
        const filterType = "data_vencimento";
        const startStr = "2026-03-01";
        const endStr = "2026-03-31"; // very short to prevent timeout
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${filterType}_de=${startStr}&${filterType}_ate=${endStr}&tamanho_pagina=100`;

        const fetchRes = await fetch(url, { headers: { 'Authorization': `Bearer ${res.token}` } });
        const data = await fetchRes.json();
        
        const paidItems = (data.itens || []).filter((x: any) => x.data_pagamento);
        const mapped = paidItems.map((x: any) => ({
             id: x.id, 
             vencimento: x.vencimento || x.data_vencimento, 
             pagamento: x.data_pagamento, 
             valor: x.valor
        }));

        return NextResponse.json({ total: data.itens?.length, paid: paidItems.length, sample: mapped.slice(0, 5) });
    } catch (e: any) {
        console.error('[DEBUG] Sync error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
