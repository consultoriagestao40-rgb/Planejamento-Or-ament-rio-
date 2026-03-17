import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { fetchAllTransactionsForYear } from '@/lib/cronSync';
import { getPrimaryTenantId, getAllVariantIds } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        if (!tenant) return NextResponse.json({ error: "No SPOT tenant found" });

        const { token } = await getValidAccessToken(tenant.id);
        const reqYear = 2026;
        const viewMode = 'competencia';

        // 1. Fetch raw CA data for JAN 2026
        const startStr = '2026-01-01';
        const endStr = '2026-01-31';
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=10`;
        const caRes = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const caRaw = await caRes.json();

        // 2. Fetch categories as cronSync does
        const allEntityIds = await getAllVariantIds(tenant.id);
        const primaryId = await getPrimaryTenantId(tenant);
        const categoriesDb = await prisma.category.findMany({ 
            where: { tenantId: { in: allEntityIds } }, 
            select: { id: true, name: true, tenantId: true } 
        });

        // 3. Build catMap
        const primaryCategories = categoriesDb.filter((c: any) => c.tenantId === primaryId);
        const catMap = new Map<string, string>();
        categoriesDb.forEach((cat: any) => {
            const raw = cat.id.includes(':') ? cat.id.split(':')[1] : cat.id;
            const primary = primaryCategories.find(p => p.name.trim() === cat.name.trim());
            const targetId = primary?.id || cat.id;
            catMap.set(raw, targetId);
            catMap.set(cat.id, targetId);
        });

        // 4. Trace why first 5 items would/wouldn't be saved
        const trace = (caRaw.itens || []).slice(0, 5).map((item: any) => {
            const cats = item.categorias || [];
            const mappedCats = cats.map((c: any) => ({
                id: c.id,
                name: c.nome,
                mappedId: catMap.get(String(c.id)) || null
            }));
            const skip = mappedCats.length === 0 || mappedCats.every(c => !c.mappedId);
            return { id: item.id, status: item.status, vencimento: item.data_vencimento, categories: mappedCats, will_skip: skip };
        });

        return NextResponse.json({
            success: true,
            tenant: tenant.name,
            primaryId,
            allEntityIds,
            categories_count: categoriesDb.length,
            catMap_size: catMap.size,
            ca_total: caRaw.total,
            trace
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.stack });
    }
}
