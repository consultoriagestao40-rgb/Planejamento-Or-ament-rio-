const fs = require('fs');
const path = require('path');

try {
    const envPath = path.join(__dirname, '../.env.development.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                    process.env[key] = val;
                }
            }
        });
    }
} catch (e) {
    console.error('Erro ao ler env:', e);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getAccessToken(tenant) {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const res = await fetch('https://auth.contaazul.com/oauth2/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tenant.refreshToken
        })
    });
    
    if (res.ok) {
        const data = await res.json();
        return data.access_token;
    } else {
        const errText = await res.text();
        throw new Error(`Erro: ${errText}`);
    }
}

async function main() {
    try {
        const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS TRATAMENTOS
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        const token = await getAccessToken(tenant);

        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2023-01-01&data_vencimento_ate=2029-12-31&data_pagamento_de=2026-06-01&data_pagamento_ate=2026-06-30&tamanho_pagina=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || data.data || []);

        console.log(`Lançamentos encontrados: ${items.length}`);
        
        items.forEach((item, idx) => {
            console.log(`\nItem ${idx + 1}: ${item.descricao} (Valor: R$ ${item.total})`);
            console.log('Chaves disponíveis:', Object.keys(item));
            const dateFields = {};
            Object.entries(item).forEach(([key, val]) => {
                if (key.includes('data') || key.includes('date') || key === 'recebimentos' || key === 'baixa') {
                    dateFields[key] = val;
                }
            });
            console.log('Campos de data/recebimento:', JSON.stringify(dateFields, null, 2));
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
