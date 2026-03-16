import { prisma } from '../src/lib/prisma';
import { getValidAccessToken } from '../src/lib/services';

async function audit() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT', mode: 'insensitive' } } });
    if (!spot) {
        console.log("SPOT not found");
        return;
    }

    console.log(`Auditing SPOT (${spot.id}) JAN 2026...`);

    // 1. Get Category ID used in DB for "Receitas de Vendas"
    const cat = await prisma.category.findFirst({ 
        where: { tenantId: spot.id, name: { contains: 'Receitas de Vendas', mode: 'insensitive' } } 
    });
    
    if (!cat) {
        console.log("Category 'Receitas de Vendas' not found in DB");
        return;
    }
    console.log(`DB Category ID: ${cat.id} | Name: ${cat.name}`);

    // 2. Fetch from DB (What the Grid shows)
    const dbEntries = await prisma.realizedEntry.findMany({
        where: { tenantId: spot.id, categoryId: cat.id, month: 0, year: 2026, viewMode: 'competencia' }
    });
    const dbTotal = dbEntries.reduce((s, e) => s + e.amount, 0);
    console.log(`Grid (DB) Total: R$ ${dbTotal.toLocaleString('pt-BR')}`);

    // 3. Simulate API Call (What the Modal does)
    const { token } = await getValidAccessToken(spot.id);
    const internalCatId = cat.id.includes(':') ? cat.id.split(':')[1] : cat.id;
    console.log(`Internal CA Category ID: ${internalCatId}`);

    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&categoria_id=${internalCatId}&tamanho_pagina=100`;
    console.log(`Fetching from API: ${url}`);
    
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const items = data.itens || [];
    
    console.log(`API Found ${items.length} items for this category ID specifically.`);

    let apiTotal = 0;
    items.forEach((item: any) => {
        if (item.status?.toUpperCase().includes('CANCEL')) return;
        const val = item.valor || item.amount || item.total || 0;
        apiTotal += val;
        console.log(` - Item: ${item.descricao} | Val: ${val} | Customer: ${item.cliente?.nome}`);
    });

    console.log(`Total from API with strict filter: R$ ${apiTotal.toLocaleString('pt-BR')}`);

    // 4. Try WITHOUT category filter to see if the missing sale is in another category
    const urlAll = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100`;
    const resAll = await fetch(urlAll, { headers: { 'Authorization': `Bearer ${token}` } });
    const dataAll = await resAll.json();
    const itemsAll = dataAll.itens || [];

    console.log(`\nAPI Found ${itemsAll.length} items TOTAL in Jan/2026 (No Category Filter)`);
    itemsAll.forEach((item: any) => {
        const val = item.valor || item.amount || item.total || 0;
        const cats = (item.categorias || []).map((c: any) => `${c.name} (${c.id})`).join(', ');
        if (item.cliente?.nome?.includes('CONTRATO FLEX') || val === 6497.08) {
             console.log(` !!! MISSING SALE FOUND: ${item.descricao} | Val: ${val} | Customer: ${item.cliente?.nome} | Cats: ${cats}`);
        }
    });
}

audit();
