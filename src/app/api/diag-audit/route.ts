import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spotTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } }
        });
        const ids = spotTenants.map(t => t.id);

        // 1. Audit Categories for the target "Receitas de Vendas"
        const baseCat = await prisma.category.findFirst({ 
            where: { tenantId: { in: ids }, name: { contains: 'Receitas de Vendas', mode: 'insensitive' } } 
        });

        if (!baseCat) return NextResponse.json({ error: 'Base category not found' });

        // 2. Expand recursive IDs
        const allCats = await prisma.category.findMany({ where: { tenantId: { in: ids } } });
        const expandedIds = new Set<string>();
        const queue = [baseCat.id];
        while (queue.length > 0) {
            const id = queue.shift()!;
            if (expandedIds.has(id)) continue;
            expandedIds.add(id);
            allCats.filter(c => c.parentId === id).forEach(c => queue.push(c.id));
        }
        
        const cleanExpandedIds = Array.from(expandedIds).map(id => id.includes(':') ? id.split(':')[1] : id);

        // 3. Fetch from API for JAN 2026
        let apiTotal = 0;
        let apiItems: any[] = [];
        for (const t of spotTenants) {
            try {
                const { token } = await getValidAccessToken(t.id);
                const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                const items = data.itens || [];
                
                items.forEach((item: any) => {
                    const cats = item.categorias || [];
                    const matches = cats.filter((c: any) => cleanExpandedIds.includes(c.id));
                    if (matches.length > 0) {
                        let val = 0;
                        matches.forEach((c: any) => {
                            val += (typeof c.valor === 'number') ? Math.abs(c.valor) : (Math.abs(item.valor || item.total || 0) / cats.length);
                        });
                        apiTotal += val;
                        apiItems.push({ desc: item.descricao, val, cats: cats.map((c:any)=>c.name) });
                    }
                });
            } catch (e) {}
        }

        return NextResponse.json({
            summary: {
                target_per_user_report: 95228.48,
                modal_calculated: apiTotal,
                discrepancy: 95228.48 - apiTotal
            },
            api_items: apiItems.sort((a,b) => b.val - a.val),
            all_expanded_categories: Array.from(expandedIds).map(id => allCats.find(c => c.id === id)?.name),
            debug: {
                tenants_found: spotTenants.map(t => t.name),
                clean_ids: cleanExpandedIds
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
