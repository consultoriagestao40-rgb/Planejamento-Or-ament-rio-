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
        
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-01-01&data_vencimento_ate=2025-12-31&tamanho_pagina=100`;
        const fetchRes = await fetch(url, { headers: { 'Authorization': `Bearer ${res.token}` } });
        const data = await fetchRes.json();
        
        const uniqueStatuses = [...new Set((data?.itens || []).map((x: any) => x.status))];
        const paidItem = (data?.itens || []).find((x: any) => x.pago > 0 && x.status !== 'OVERDUE');
        return NextResponse.json({ 
            total: data?.itens?.length, 
            uniqueStatuses,
            firstPaidItem: paidItem ? { keys: Object.keys(paidItem), status: paidItem.status, pago: paidItem.pago, data_pagamento: paidItem.data_pagamento, data_competencia: paidItem.data_competencia, data_vencimento: paidItem.data_vencimento } : null
        });
    } catch (e: any) {
        console.error('[DEBUG] Sync error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
