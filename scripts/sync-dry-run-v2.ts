import { PrismaClient } from '@prisma/client';
import { fetchAllTransactionsForYear } from '../src/lib/cronSync';
import { getValidAccessToken } from '../src/lib/services';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

const db = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function run() {
    console.log("--- SYNC DRY RUN - JAN/2026 ---");
    try {
        const t = await db.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        if (!t) return console.log("SPOT not found");

        console.log(`Using Tenant: ${t.name} (${t.id})`);
        
        // We need a valid token. getValidAccessToken uses @/lib/prisma, 
        // so we'll do its logic here to be safe and independent.
        let accessToken = t.accessToken;
        
        // Let's just use the hardcoded client ID/Secret for refresh if needed
        // but we'll try with the current token first.
        
        const year = 2026;
        const viewMode = 'competencia';
        const startStr = `${year}-01-01`; 
        const endStr = `${year}-01-31`;

        const endpoints = [
            { url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar`, isExpense: false, name: 'Receivables' },
            { url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/outros-recebimentos/buscar`, isExpense: false, name: 'Other Receipts' },
            { url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/outras-receitas/buscar`, isExpense: false, name: 'Other Revenue' }
        ];

        let totalRevenue = 0;
        const allItems: any[] = [];

        for (const ep of endpoints) {
            console.log(`Fetching from: ${ep.name}...`);
            const fullUrl = `${ep.url}?data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
            
            const res = await fetch(fullUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) {
                console.warn(`Failed to fetch ${ep.name}: ${res.status}`);
                continue;
            }
            const data = await res.json();
            const items = data.itens || [];
            console.log(`- Found ${items.length} items`);
            
            items.forEach((item: any) => {
                const amount = item.valor || item.total || 0;
                totalRevenue += amount;
                allItems.push({ source: ep.name, id: item.id, desc: item.descricao, val: amount });
            });
        }

        console.log("\nSummary for Jan/2026:");
        console.log(`Total Revenue (Competence): R$ ${totalRevenue.toFixed(2)}`);
        
        if (totalRevenue < 160000) {
            console.log("\nWarning: Still missing significant revenue. Checking Sales endpoint...");
            const salesUrl = `https://api-v2.contaazul.com/v1/venda/busca?emission_start=${startStr}&emission_end=${endStr}&tamanho_pagina=100`;
            const sRes = await fetch(salesUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (sRes.ok) {
                const sData = await sRes.json();
                const sales = sData || [];
                console.log(`- Sales Endpoint found ${sales.length} items.`);
                let salesTotal = 0;
                sales.forEach((s: any) => {
                    const val = s.total || s.valor || 0;
                    salesTotal += val;
                });
                console.log(`- Sales Total: R$ ${salesTotal.toFixed(2)}`);
            }
        }

        console.log("\nTop 10 Items:");
        allItems.sort((a, b) => b.val - a.val).slice(0, 10).forEach(i => {
           console.log(`- [${i.source}] ${i.desc}: R$ ${i.val.toFixed(2)} (${i.id})`);
        });

    } catch (e: any) {
        console.error("Dry Run Failed:", e.message);
    } finally {
        await db.$disconnect();
    }
}

run();
