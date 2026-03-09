const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

async function main() {
    console.log("Fetching all tenants...");
    const tenants = await prisma.tenant.findMany({
        where: {
            accessToken: { not: null, not: 'test-token' }
        }
    });

    for (const tenant of tenants) {
        if (!tenant.name.includes("JVS FACILITIES")) continue; // Target JVS Facilities
        console.log(`\n--- Tenant: ${tenant.name} ---`);
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2025-12-01&data_vencimento_ate=2026-02-28&tamanho_pagina=100`;

        const options = {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` }
        };

        await new Promise((resolve) => {
            https.get(url, options, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    try {
                        const body = JSON.parse(raw);
                        const items = body.itens || [];
                        console.log(`Fetched ${items.length} items`);
                        
                        // Look for total value ~5744
                        const matchingTotal = items.filter(i => {
                            const val = i.valor || i.total || i.valor_original;
                            return val >= 5740 && val <= 5750;
                        });

                        if (matchingTotal.length > 0) {
                            console.log(`\nFOUND ${matchingTotal.length} MATCHING TRANSACTIONS BY TOTAL (5744):`);
                            matchingTotal.forEach(t => {
                                console.log(`Desc: ${t.descricao} | Total: ${t.valor || t.total} | Date: ${t.data_vencimento || t.vencimento}`);
                                console.log("CCs:", JSON.stringify(t.centros_de_custo, null, 2));
                            });
                        }
                        
                    } catch (e) {
                        console.log("Error parsing JSON:", e);
                    }
                    resolve();
                });
            }).on('error', (e) => {
                console.error(e);
                resolve();
            });
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
