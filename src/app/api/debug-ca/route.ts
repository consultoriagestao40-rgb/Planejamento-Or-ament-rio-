import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        async function runScan(endpoint: string) {
            let res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${endpoint}/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100&pagina=1`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) return { error: await res.text() };
            const data = await res.json();
            const items = data.itens || [];

            for (const item of items) {
                const amount = item.valor || item.total || 0;
                if (Math.abs(amount - 18649.67) < 0.1 || Math.abs(amount - 39767) < 0.1) {
                    return item; // RETURN THE ENTIRE OBJECT AS-IS!
                }
            }
            return { error: 'not_found' };
        }

        const payableRaw = await runScan('contas-a-pagar');

        return NextResponse.json({
            success: true,
            payableRaw
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
