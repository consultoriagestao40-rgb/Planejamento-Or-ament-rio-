import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId') || 'ALL';
        const categoryId = searchParams.get('categoryId') || '626f634b-b2f7-463d-8628-86d7ce75079a'; // Receitas de Vendas

        const { prisma } = await import('@/lib/prisma');
        const tenants = tenantId === 'ALL'
            ? await prisma.tenant.findMany()
            : await prisma.tenant.findMany({ where: { id: tenantId } });

        const results: any[] = [];

        for (const t of tenants) {
            const { token } = await getValidAccessToken(t.id);
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&categoria_id=${categoryId}&tamanho_pagina=100`;
            
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                const items = data.itens || [];
                const filtered = items.filter((it: any) => 
                    it.cliente?.nome?.includes('MRV') || 
                    it.cliente?.nome?.includes('FIGWAL') ||
                    it.descricao?.includes('MRV') ||
                    it.descricao?.includes('FIGWAL')
                );
                results.push({
                    tenant: t.name,
                    count: items.length,
                    found: filtered
                });
            }
        }

        const dbEntries = await prisma.syncLog.findMany({
            where: {
                tenantId: tenants[0]?.id,
                categoryId: categoryId,
                date: {
                    gte: new Date('2026-01-01'),
                    lte: new Date('2026-01-31')
                }
            }
        });

        return NextResponse.json({
            api: results,
            db: dbEntries.filter(e => e.description.includes('MRV') || e.description.includes('FIGWAL'))
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
