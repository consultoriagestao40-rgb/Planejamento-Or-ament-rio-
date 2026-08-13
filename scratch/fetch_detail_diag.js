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

        const id = '717bb6b6-d2fe-4151-a64e-bb529e12d728';
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${id}`;
        console.log(`Buscando detalhes do título: ${url}`);
        
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!res.ok) {
            console.error(`Erro ao buscar: ${res.status}`);
            return;
        }

        const data = await res.json();
        console.log('Detalhes do Título:', JSON.stringify(data, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
