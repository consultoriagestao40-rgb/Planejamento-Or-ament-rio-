import { prisma } from '../src/lib/prisma.ts';
import { getValidAccessToken } from '../src/lib/services.ts';

async function run() {
    console.log("Starting test...");
    const tenants = await prisma.tenant.findMany();
    const spot = tenants.find(t => t.name.includes('SPOT'));
    const jvs = tenants.find(t => t.name.includes('JVS'));

    for (const t of [spot, jvs]) {
        if (!t) continue;
        console.log(`\n--- Fetching for ${t.name} ---`);
        try {
            const { token } = await getValidAccessToken(t.id);
            const startStr = '2026-01-01';
            const endStr = '2026-01-31';
            const payablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;

            const res = await fetch(payablesUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            console.log(`Matched ${data.itens?.length || 0} total payables in timeframe.`);

            // Just dump the first few items that match category or name
            const filtered = data.itens?.filter((i: any) =>
                i.categorias?.some((c: any) => c.nome?.toLowerCase().includes('salário') || c.nome?.includes('03.1')) ||
                i.descricao?.toLowerCase().includes('folha')
            );

            if (filtered && filtered.length > 0) {
                console.log(`Found ${filtered.length} salary items:`);
                filtered.forEach((i: any) => {
                    console.log(`\n- ID: ${i.id}`);
                    console.log(`  Desc: ${i.descricao}`);
                    console.log(`  Obs: ${i.observacao}`);
                    console.log(`  Valor: ${i.valor}`);
                    console.log(`  Categorias: ${i.categorias?.map((c: any) => c.nome).join(', ')}`);
                    console.log(`  Centros Custo: ${i.centros_de_custo?.map((c: any) => `${c.nome} (${c.id})`).join(', ')}`);
                });
            } else {
                console.log("No salary items found. Dumping first 1 item to see structure:");
                console.log(JSON.stringify(data.itens?.[0] || {}, null, 2));
            }
        } catch (e: any) {
            console.error(`Error for ${t.name}:`, e.message);
        }
    }
}
run();
