
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Iniciando Debug da Diferença (Jan/2026)...");

    const tenant = await prisma.tenant.findFirst();
    if (!tenant || !tenant.accessToken) {
        console.error("❌ Token não encontrado.");
        return;
    }

    const token = tenant.accessToken;
    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-01-01&data_vencimento_ate=2027-01-01&tamanho_pagina=1000`;
    console.log(`📡 Fetching Receivables from: ${url}`);

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) { console.error("❌ Erro:", res.status); return; }

    const data = await res.json();
    const items = data.itens || [];

    items.forEach((item: any) => {
        const clientName = (item.cliente && item.cliente.nome) ? item.cliente.nome : '';
        const status = (item.status || '').toUpperCase();

        if (clientName && clientName.includes("PINHAIS") && !status.includes('CANCEL')) {
            console.log("\n🔎 FULL PINHAIS DUMP:");
            console.log(JSON.stringify(item, null, 2));

            // Check for hidden fields
            const keys = Object.keys(item);
            console.log("Keys:", keys.join(", "));

            // Check for retentions specifically
            if (item.retencoes) console.log("Has Retencoes:", item.retencoes);

            // Check if any value matches ~556 or ~12009
            const str = JSON.stringify(item);
            if (str.includes("556") || str.includes("1200")) {
                console.log("✅ FOUND EXPECTED VALUE IN OBJECT!");
            } else {
                console.log("❌ Value not found in object string.");
            }
        }
    });

    // SWAPPING TO DETAILS BY ID (PINHAIS ID from previous run)
    const pinhaisId = "9cc4fbe1-7a6e-4277-8b4e-d2ba0656442d";

    // Potential Endpoints to Try
    const urls = [
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${pinhaisId}`,
        `https://api-v2.contaazul.com/v1/financeiro/contas-a-receber/${pinhaisId}`,
        `https://api-v2.contaazul.com/v1/receivables/${pinhaisId}`,
        `https://api-v2.contaazul.com/v1/financial/receivables/${pinhaisId}`,
        `https://api.contaazul.com/v1/sales/${pinhaisId}`, // Just in case v1 works
        `https://api.contaazul.com/v1/lancamentos/${pinhaisId}`
    ];

    // Decode Token to check scopes
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        console.log(`🔐 Token Scopes: ${payload.scope || payload.authorities}`);
    } catch (e) { console.log("⚠️ Could not decode token"); }

    // Placeholder for items, assuming this will be populated from an API call that returns a list
    // For the purpose of this edit, we'll assume 'items' is an array of objects
    // If the intention was to fetch a list, the API calls above would need to be adjusted.
    // Aggregation logic starts here using the 'items' fetched above

    for (const url of urls) {
        console.log(`📡 Trying: ${url}`);
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            console.log(`   Status: ${res.status}`);
            if (res.ok) {
                const item = await res.json();
                console.log(`\n✅ SUCCESS! 🔹 FULL DETAIL OBJECT:`, JSON.stringify(item, null, 2));
                // If the goal is to aggregate, we should be pushing items into the 'items' array here
                // For now, we'll just add the single item found, but this part likely needs adjustment
                // if the intention is to fetch a list of items for aggregation.
                items.push(item);
                break; // Break after first success, as current logic fetches a single item
            }
        } catch (e: any) {
            console.log(`   Error: ${e.message}`);
        }
    }

    // Aggregate by Category
    const categoryTotals: Record<string, number> = {};

    items.forEach((item: any) => {
        // Checar competência jan/2026
        const compDate = item.data_competencia || item.data_vencimento;
        if (!compDate) return;
        const date = new Date(compDate);
        if (date.getFullYear() !== 2026 || date.getMonth() !== 0) return;

        const v = parseFloat(item.total || item.valor || 0);

        // Sum Category
        const cats = item.categorias || [];
        if (cats.length > 0) {
            const catName = cats[0].nome;
            categoryTotals[catName] = (categoryTotals[catName] || 0) + v;
        } else {
            categoryTotals['SEM CATEGORIA'] = (categoryTotals['SEM CATEGORIA'] || 0) + v;
        }
    });

    console.log("\n--- SOMA POR CATEGORIA (Jan 2026) ---");
    Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]) // highest first
        .forEach(([name, val]) => {
            console.log(`${name.padEnd(40)} | R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        });

}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
