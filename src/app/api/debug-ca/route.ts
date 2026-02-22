import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId');

        const accessToken = await getValidAccessToken();
        let ccsEncontrados: any = {};

        async function runScan(endpoint: string, label: string) {
            let matches = 0;
            let total = 0;
            const itemsMatch: any[] = [];

            for (let i = 1; i <= 20; i++) {
                let url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${endpoint}/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100&pagina=${i}`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (!res.ok) break;
                const data = await res.json();
                const items = data.itens || [];
                if (items.length === 0) break;

                items.forEach((item: any) => {
                    total++;
                    const ccs = item.centros_de_custo || [];
                    const amount = item.valor || item.valor_original || item.total || 0;
                    if ((amount > 18000 && amount < 19000) || (amount > 39000 && amount < 40000)) {
                        matches++;
                        itemsMatch.push({
                            id: item.id,
                            valor: amount,
                            descricao: item.descricao,
                            categorias: item.categorias,
                            centros_de_custo: ccs
                        });
                    }
                });
            }
            return { total, matches, itemsMatch };
        }

        const payables = await runScan('contas-a-pagar', 'pagar');
        const receivables = await runScan('contas-a-receber', 'receber');

        return NextResponse.json({
            success: true,
            payables,
            receivables
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
