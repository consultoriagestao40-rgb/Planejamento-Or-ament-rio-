import { prisma } from './src/lib/prisma';
import { getValidAccessToken } from './src/lib/services';
import { fetchAllTransactionsForYear } from './src/lib/cronSync';

async function nuclear() {
    const spotTenant = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spotTenant) { console.log("SPOT not found"); return; }
    
    console.log(`Analyzing SPOT (${spotTenant.id})...`);
    const { token } = await getValidAccessToken(spotTenant.id);
    
    const year = 2026;
    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar`;
    
    console.log("Fetching RAW transactions (Competencia)...");
    const txs = await fetchAllTransactionsForYear(token, url, year, 'competencia', false, (m) => console.log(m));
    
    console.log(`Found ${txs.length} transactions for 2026.`);
    let total = 0;
    txs.forEach(t => {
        total += Math.abs(t.amount);
        console.log(` - [${t.month}] ${t.description || 'no desc'}: ${t.amount} (Cat: ${JSON.stringify(t.categories)})`);
    });
    console.log(`TOTAL REVENUE FOUND: ${total}`);
}

nuclear();
