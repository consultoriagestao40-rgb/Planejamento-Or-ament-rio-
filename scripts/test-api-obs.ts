import { prisma } from '../src/lib/prisma';
import { getValidAccessToken } from '../src/lib/services';

async function test() {
    const tenants = await prisma.tenant.findMany();
    const clean = tenants.find(t => t.name.includes('CLEAN'));
    const { token } = await getValidAccessToken(clean!.id);
    const startStr = '2026-01-01';
    const endStr = '2026-01-31';
    const receivablesUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=10`;
    const req = await fetch(receivablesUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await req.json();
    console.log("Item 1 keys:", Object.keys(data.itens[0]).join(', '));
    console.log("Observacao present?", data.itens[0].hasOwnProperty('observacao'));
}
test();
