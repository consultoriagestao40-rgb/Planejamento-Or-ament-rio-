import { prisma } from '../src/lib/prisma';
import { getValidAccessToken } from '../src/lib/services';

async function audit() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT', mode: 'insensitive' } } });
    if (!spot) return;

    console.log(`--- AUDITORIA SPOT JAN 2026 (Grid vs API) ---`);

    // 1. O que está no DB (Fonte do Grid)
    const dbEntries = await prisma.realizedEntry.findMany({
        where: { tenantId: spot.id, month: 0, year: 2026, viewMode: 'competencia' },
        include: { category: true }
    });
    const gridTotal = dbEntries.reduce((s, e) => s + e.amount, 0);
    console.log(`Total no Grid (DB): R$ ${gridTotal.toLocaleString('pt-BR')}`);

    // 2. O que a API retorna (Fonte do Modal)
    const { token } = await getValidAccessToken(spot.id);
    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const items = data.itens || [];

    let apiTotal = 0;
    const targetCatIds = dbEntries.map(e => e.categoryId.split(':')[1]);

    console.log(`\n--- ITENS NA API (JAN 2026) ---`);
    items.forEach((item: any) => {
        if (item.status?.toUpperCase().includes('CANCEL')) return;
        
        const cats = item.categorias || [];
        const isMatch = cats.some((c: any) => targetCatIds.includes(c.id));
        const val = item.valor || item.amount || item.total || 0;
        
        if (isMatch) {
            apiTotal += val;
            console.log(`[OK] ${item.descricao} | R$ ${val.toLocaleString('pt-BR')} | Cats: ${cats.map((c:any)=>c.name).join(', ')}`);
        } else {
            console.log(`[IGNORE] ${item.descricao} | R$ ${val.toLocaleString('pt-BR')} | Cats: ${cats.map((c:any)=>c.name).join(', ')}`);
        }
    });

    console.log(`\nTotal Calculado via API: R$ ${apiTotal.toLocaleString('pt-BR')}`);
    console.log(`Diferença: R$ ${(gridTotal - apiTotal).toLocaleString('pt-BR')}`);
}

audit();
