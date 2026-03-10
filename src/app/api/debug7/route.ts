import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await ensureTenantSchema();
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'JVS', mode: 'insensitive' } }
        });

        if (!tenant) return NextResponse.json({ error: 'JVS Tenant não encontrado' });

        const { token } = await getValidAccessToken(tenant.id);

        const year = 2026;
        const month = 1; // January
        const startStr = `2025-12-01`;
        const endStr = `2026-02-28`;

        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!res.ok) return NextResponse.json({ error: 'Failed to fetch from CA', status: res.status });

        const data = await res.json();
        const items = data.itens || [];

        const venda359 = items.find((i: any) => (i.descricao || '').includes('Venda 359'));
        
        const categories = await prisma.category.findMany({
            where: { tenantId: tenant.id }
        });

        // let's see which category ids from DB match the categories in venda359
        const mapping = venda359 ? venda359.categorias.map((c: any) => {
            const dbCat = categories.find(db => db.id === c.id);
            return {
                ca_cat: c,
                db_cat: dbCat ? { name: dbCat.name, code: dbCat.code } : 'NOT IN DB'
            };
        }) : [];

        // Let's also check the actual DAS category from DB
        const dasCatId = categories.find(c => c.name.includes('Simples Nacional - DAS'))?.id;

        return NextResponse.json({
            venda359_raw: venda359,
            venda359_categories_mapping: mapping,
            db_das_category_id: dasCatId
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
