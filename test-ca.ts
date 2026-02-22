import { prisma } from './src/lib/prisma';
import { getValidAccessToken } from './src/lib/services';

async function main() {
  try {
    const token = await getValidAccessToken();
    const res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log("Item 0 JSON:", JSON.stringify(data.itens[0], null, 2));
  } catch(e) {
    console.error(e);
  }
}
main();
