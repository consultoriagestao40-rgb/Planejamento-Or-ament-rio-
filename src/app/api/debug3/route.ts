import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { accessToken: { not: null } }
        });

        const results: any[] = [];

        for (const tenant of tenants) {
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 10) {
                const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100&pagina=${page}`;

                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
                    cache: 'no-store'
                });

                if (!res.ok) { hasMore = false; break; }

                const data = await res.json();
                const items = data.itens || [];
                if (items.length === 0) { hasMore = false; break; }

                const match = items.find((i: any) => i.id === 'f9a440ef-19ec-4678-95d0-dda9b21fd04b');
                if (match) {
                    results.push({ tenant: tenant.name, exactMatch: match });
                    hasMore = false; // found it
                    break;
                }
                page++;
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
