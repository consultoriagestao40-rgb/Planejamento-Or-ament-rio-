import { PrismaClient } from '@prisma/client';
import { getValidAccessToken } from '../src/lib/services';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting CA Inspection...");
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!tenant) throw new Error("Tenant not found");

    const { token } = await getValidAccessToken(tenant.id);
    const year = 2026;
    const startStr = `${year}-01-01`;
    const endStr = `${year}-01-31`;
    const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=10`;

    console.log(`Fetching from: ${url}`);
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) {
        console.error(`Error: ${res.status}`);
        return;
    }

    const data = await res.json();
    console.log(`Total found: ${data.total || 0}`);
    if (data.itens && data.itens.length > 0) {
        console.log("Sample Item:", JSON.stringify(data.itens[0], null, 2));
    } else {
        console.log("No items found for Jan 2026.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
