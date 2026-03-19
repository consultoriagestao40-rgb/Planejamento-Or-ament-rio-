import { prisma } from './src/lib/prisma';
import { getValidAccessToken } from './src/lib/services';

async function dumpSpot() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) return;
    const { token } = await getValidAccessToken(spot.id);
    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?tamanho_pagina=10`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const items = data.itens || [];
    console.log(`Dumping ${items.length} items for SPOT...`);
    items.forEach((item: any, i: number) => {
        console.log(`[${i}] ID: ${item.id} | Desc: ${item.descricao}`);
        console.log(`    Dates: Venc=${item.data_vencimento}, Pag=${item.data_pagamento}, Comp=${item.data_competencia}, Emiss=${item.data_emissao}`);
        console.log(`    Values: Total=${item.valor_total || item.total}, Pago=${item.valor_pago || item.pago}`);
        console.log(`    Cats: ${JSON.stringify(item.categorias)}`);
    });
}
dumpSpot();
