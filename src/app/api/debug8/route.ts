import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await ensureTenantSchema();
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'JVS FACILITIES', mode: 'insensitive' } }
        });

        if (!tenant) return NextResponse.json({ error: 'JVS Tenant não encontrado' });

        const { token } = await getValidAccessToken(tenant.id);

        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-03-31&tamanho_pagina=1000`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        let venda359 = null;
        if (res.ok) {
            const data = await res.json();
            const items = data.itens || [];
            venda359 = items.find((i: any) => (i.descricao || '').includes('Venda 359') || (i.observacao || '').includes('Venda 359'));
        }

        const categories = await prisma.category.findMany({
            where: { tenantId: tenant.id }
        });

        const catMap = venda359?.categorias?.map((c: any) => {
            const dbCat = categories.find(db => db.id === c.id);
            return dbCat ? { name: dbCat.name, code: dbCat.code } : `ID ${c.id} NOT DB`;
        });

        return NextResponse.json({
            venda: venda359,
            categorias_mapeadas: catMap,
            das_categories_in_db: categories.filter(c => c.name.toLowerCase().includes('das'))
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
