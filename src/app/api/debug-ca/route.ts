import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        async function runScan(endpoint: string, label: string) {
            let total = 0;
            const itemsMatch: any[] = [];

            for (let i = 1; i <= 10; i++) {
                let url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${endpoint}/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100&pagina=${i}`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (!res.ok) break;
                const data = await res.json();
                const items = data.itens || [];
                if (items.length === 0) break;

                for (const item of items) {
                    total++;
                    const amount = item.valor || item.valor_original || item.total || 0;

                    if (Math.abs(amount - 18649.67) < 0.1 || Math.abs(amount - 39767) < 0.1) {
                        try {
                            const detailRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/${endpoint}/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                            const detail = await detailRes.json();
                            itemsMatch.push({
                                id: item.id,
                                amount: amount,
                                base: item,
                                detailed: detail
                            });
                        } catch (e) {
                            itemsMatch.push({ id: item.id, error: 'detail failed' });
                        }
                    }
                }
                if (itemsMatch.length >= 2) break;
            }
            return { total, itemsMatch };
        }

        const payables = await runScan('contas-a-pagar', 'pagar');

        return NextResponse.json({
            success: true,
            payables
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
