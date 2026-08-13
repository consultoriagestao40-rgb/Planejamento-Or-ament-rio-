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
    // Tentar dar refresh no token
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    console.log(`Dando refresh no token de ${tenant.name}...`);
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
        await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000)
            }
        });
        return data.access_token;
    } else {
        const errText = await res.text();
        throw new Error(`Erro ao dar refresh no token: ${res.status} - ${errText}`);
    }
}

async function main() {
    try {
        const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS TRATAMENTOS
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        
        const token = await getAccessToken(tenant);
        console.log('Token obtido com sucesso!');

        // Buscar Contas a Receber pagas em Junho de 2026
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2023-01-01&data_vencimento_ate=2029-12-31&data_pagamento_de=2026-06-01&data_pagamento_ate=2026-06-30&tamanho_pagina=100`;
        console.log(`Buscando: ${url}`);
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            const errBody = await res.text();
            console.error(`Erro na busca: status ${res.status}: ${errBody}`);
            return;
        }
        
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || data.data || []);
        
        console.log(`Lançamentos recebidos encontrados no Conta Azul para Junho/2026: ${items.length}`);
        
        if (items.length > 0) {
            console.log('Primeiros 3 lançamentos do Conta Azul:');
            console.log(JSON.stringify(items.slice(0, 3), null, 2));
        }

    } catch (err) {
        console.error('Erro geral:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
