const https = require('https');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100&pagina=1';
    const options = { headers: { 'Authorization': `Bearer ${tenant.accessToken}` } };

    // just fetch all pages to find it
    for (let page = 1; page <= 6; page++) {
        await new Promise(res => {
            https.get(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100&pagina=${page}`, options, (response) => {
                let body = '';
                response.on('data', d => body += d);
                response.on('end', () => {
                    try {
                        let data = JSON.parse(body);
                        let match = (data.itens || []).find(i => i.id === 'f9a440ef-19ec-4678-95d0-dda9b21fd04b');
                        if (match) {
                            console.log("FOUND RAW JSON:");
                            console.log(JSON.stringify(match, null, 2));
                        }
                    } catch(e) {}
                    res();
                });
            });
        });
    }
}
main().finally(() => setTimeout(() => prisma.$disconnect(), 1000));
