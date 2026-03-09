const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

async function main() {
  const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: 'JVS FACILITIES' } }
  });
  if (!tenant || !tenant.accessToken) {
      console.log("No tenant token found.");
      return;
  }
  
  console.log(`Using token for ${tenant.name}`);
  const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100`;

  const options = {
    headers: { 'Authorization': `Bearer ${tenant.accessToken}` }
  };
  
  https.get(url, options, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try {
        const body = JSON.parse(raw);
        console.log(`Fetched ${body.itens ? body.itens.length : 0} items`);
        const vtItem = body.itens.find(i => i.descricao && i.descricao.includes('Rebou'));
        if (vtItem) {
          console.log("\nFOUND MATCHING TRANSACTION:");
          console.log(`Desc: ${vtItem.descricao}`);
          console.log(`Total: ${vtItem.valor || vtItem.total}`);
          console.log("\nCentros de Custo JSON:");
          console.log(JSON.stringify(vtItem.centros_de_custo, null, 2));
        } else {
          console.log("No specific VT transaction found in first page.");
        }
      } catch (e) {
        console.log(e);
      }
    });
  }).on('error', console.error);
}

main().catch(console.error).finally(() => prisma.$disconnect());
