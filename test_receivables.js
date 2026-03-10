const https = require('https');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100&pagina=1';
    
    https.get(url, { headers: { 'Authorization': `Bearer ${tenant.accessToken}` } }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            const data = JSON.parse(body);
            const items = data.itens || [];
            
            // Look for Venda 359
            const venda359 = items.filter(i => i.descricao && i.descricao.includes('Venda 359'));
            console.log(`Found ${venda359.length} instances of Venda 359 in API response:`);
            console.log(venda359.map(v => ({ id: v.id, total: v.total, ccs: v.centros_de_custo.length })));
        });
    });
}
main().finally(() => setTimeout(() => prisma.$disconnect(), 3000));
