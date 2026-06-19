import { prisma } from '../src/lib/prisma';
import { getValidAccessToken } from '../src/lib/services';

const CLEAN_TECH_ID = '1fa165e3-178f-4d8f-ae7c-434c720c82dd';

async function main() {
    console.log("=== DEEP DEBUGGING PDD/JASMINE FOR CLEAN TECH (YEAR 2026) ===");
    
    // Get valid token
    const { token } = await getValidAccessToken(CLEAN_TECH_ID);
    console.log("Acquired valid Conta Azul access token.");

    // Search the whole year 2026
    const startStr = `2026-01-01`;
    const endStr = `2026-12-31`;

    // 1. Check in Realized Entries currently in the database
    console.log("\n1. Checking DB Entries...");
    const dbEntries = await prisma.realizedEntry.findMany({
        where: {
            tenantId: CLEAN_TECH_ID,
            year: 2026
        },
        include: {
            category: true
        }
    });

    console.log(`Found ${dbEntries.length} realized entries in DB for 2026.`);
    for (const e of dbEntries) {
        if (e.amount === 2700 || e.amount === -2700 || e.description?.includes("Jasmine") || e.category.name.includes("PDD") || e.category.name.includes("Perda")) {
            console.log(`- DB Entry: ID=${e.id}, Month=${e.month}, Amount=${e.amount}, Desc="${e.description}", Cat="${e.category.name}" (ID=${e.categoryId}), ViewMode=${e.viewMode}`);
        }
    }

    // 2. Query Conta Azul API for Receivables (competence in 2026)
    console.log("\n2. Querying Conta Azul Receivables API for 2026 (Competence)...");
    await fetchAndFilter(token, `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`, "Receivables (Competence)");

    // 3. Query Conta Azul API for Receivables (due in 2026)
    console.log("\n3. Querying Conta Azul Receivables API for 2026 (Due Date)...");
    await fetchAndFilter(token, `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`, "Receivables (Due Date)");

    // 4. Query Conta Azul API for Payables (competence in 2026)
    console.log("\n4. Querying Conta Azul Payables API for 2026 (Competence)...");
    await fetchAndFilter(token, `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`, "Payables (Competence)");

    // 5. Query Conta Azul API for Sales in 2026
    console.log("\n5. Querying Conta Azul Sales API for 2026...");
    await fetchAndFilter(token, `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`, "Sales");
}

async function fetchAndFilter(token: string, url: string, type: string) {
    let pagina = 1;
    let hasMore = true;
    while (hasMore) {
        const pagedUrl = `${url}&pagina=${pagina}`;
        const res = await fetch(pagedUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        if (!res.ok) {
            console.error(`API Error: ${res.status}`);
            break;
        }
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
        if (items.length === 0) break;

        for (const item of items) {
            const desc = item.descricao || item.description || '';
            const amount = item.valor_total || item.total || item.valor || item.pago || 0;
            const categories = item.categorias || (item.categoria ? [item.categoria] : []);
            const clientName = item.cliente?.nome || item.fornecedor?.nome || '';

            const isMatch = amount === 2700 || amount === -2700 || desc.includes("Jasmine") || clientName.includes("Jasmine") || categories.some((c: any) => {
                const cname = c.nome || c.name || '';
                return cname.includes("PDD") || cname.includes("Perda");
            });

            if (isMatch) {
                console.log(`\n[Found in ${type}]`);
                console.log(JSON.stringify({
                    id: item.id,
                    descricao: desc,
                    valor: amount,
                    cliente: clientName,
                    status: item.status,
                    data_competencia: item.data_competencia,
                    data_vencimento: item.data_vencimento,
                    data_pagamento: item.data_pagamento,
                    data_baixa: item.data_baixa,
                    categorias: categories
                }, null, 2));
            }
        }
        if (items.length < 100) hasMore = false;
        else pagina++;
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
