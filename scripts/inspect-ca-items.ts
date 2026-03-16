import { prisma } from './src/lib/prisma';
import { getValidAccessToken } from './src/lib/services';

async function inspect() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) return console.log("SPOT not found");

    const { token } = await getValidAccessToken(spot.id);
    const start = '2026-01-01';
    const end = '2026-01-31';
    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data: any = await res.json();
    const items = data.itens || [];

    console.log(`Encontrados ${items.length} itens no CA para Jan/2026`);
    
    // Check for duplicates or high values
    let total = 0;
    items.forEach((item: any) => {
        total += item.valor || item.total || 0;
        console.log(`ID: ${item.id} | Desc: ${item.descricao} | Valor: ${item.valor || item.total} | Status: ${item.status}`);
    });
    console.log(`Total Bruto dos Itens: ${total}`);
}

inspect();
