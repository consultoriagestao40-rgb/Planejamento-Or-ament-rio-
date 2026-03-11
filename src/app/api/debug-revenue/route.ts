import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tenantName = searchParams.get('tenant') || 'SPOT'; // Default: Spot Facilities

    try {
        const tenants = await prisma.tenant.findMany();
        const tenant = tenants.find(t => t.name.toUpperCase().includes(tenantName.toUpperCase()));
        if (!tenant) return NextResponse.json({ error: `Tenant '${tenantName}' not found`, available: tenants.map(t => t.name) });

        const { token } = await getValidAccessToken(tenant.id);

        // Fetch categories from DB for this tenant
        const dbCats = await prisma.category.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
        const validCatIds = new Set(dbCats.map(c => c.id));

        // Fetch January 2026 receivables from Conta Azul
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-11-01&data_vencimento_ate=2027-02-28&tamanho_pagina=100&pagina=1`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return NextResponse.json({ error: `CA API error: ${res.status}` });

        const data = await res.json();
        const items = data.itens || [];

        // Filter to January 2026 competencia
        const janItems = items.filter((item: any) => {
            const dateStr = item.data_competencia || item.data_vencimento;
            const d = dateStr ? new Date(dateStr) : null;
            return d && d.getFullYear() === 2026 && d.getMonth() === 0;
        });

        // Analyze each item
        const analysis = janItems.map((item: any) => {
            const cats = item.categorias || [];
            const firstCat = cats[0];
            const catInDb = firstCat ? validCatIds.has(firstCat.id) : false;

            return {
                id: item.id,
                descricao: item.descricao || item.observacao,
                data_competencia: item.data_competencia,
                data_vencimento: item.data_vencimento,
                total: item.total,
                pago: item.pago,
                status: item.status,
                cats: cats.map((c: any) => ({ id: c.id, nome: c.nome })),
                catInDb,
                WOULD_BE_INCLUDED: cats.length > 0 && catInDb
            };
        });

        const included = analysis.filter((i: any) => i.WOULD_BE_INCLUDED);
        const excluded = analysis.filter((i: any) => !i.WOULD_BE_INCLUDED);
        const totalIncluded = included.reduce((s: number, i: any) => s + Math.abs(i.total || 0), 0);
        const totalExcluded = excluded.reduce((s: number, i: any) => s + Math.abs(i.total || 0), 0);

        return NextResponse.json({
            tenant: tenant.name,
            jan_items_total: janItems.length,
            totalIncluded: totalIncluded.toFixed(2),
            totalExcluded: totalExcluded.toFixed(2),
            db_categories_count: dbCats.length,
            excluded_transactions: excluded,
            included_total_sum: totalIncluded.toFixed(2)
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
