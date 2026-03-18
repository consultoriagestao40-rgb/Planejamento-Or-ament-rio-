import { PrismaClient } from '@prisma/client';
import { getValidAccessToken } from './src/lib/services';

const prisma = new PrismaClient();

async function main() {
    console.log("=== DEEP DIVE: CLEAN TECH JAN 2026 ===");
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'CLEAN' } } });
    if (!tenant) throw new Error("Clean Tech tenant not found");

    const { token } = await getValidAccessToken(tenant.id);
    const startStr = '2026-01-01';
    const endStr = '2026-01-31';
    
    // Check both receivables and payables just in case of misclassification
    const urls = [
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`
    ];

    for (const url of urls) {
        console.log(`\nFetching: ${url}`);
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        console.log(`Total items: ${data.total || 0}`);
        
        (data.itens || []).forEach((item: any) => {
            const cats = (item.categorias || []).map((c: any) => c.nome).join(', ');
            console.log(`[${item.data_vencimento}] [${item.status}] [${cats}] Amt: ${item.valor} | Desc: ${item.descricao}`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
