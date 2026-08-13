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

async function main() {
    try {
        console.log('--- STATUS DAS INTEGRAÇÕES DO CONTA AZUL ---');
        
        // No schema.prisma, a tabela de integração pode ser Tenant
        const tenants = await prisma.tenant.findMany();
        
        tenants.forEach(t => {
            console.log(`Empresa: ${t.name}`);
            console.log(`  - ID:             ${t.id}`);
            console.log(`  - Token Expira em: ${t.tokenExpiresAt ? new Date(t.tokenExpiresAt).toLocaleString('pt-BR') : 'N/A'}`);
            console.log(`  - Status:         ${t.tokenExpiresAt && new Date(t.tokenExpiresAt) > new Date() ? 'ATIVO' : 'EXPIRADO'}`);
            console.log(`  - Criado em:      ${t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : 'N/A'}`);
            console.log(`  - Atualizado em:  ${t.updatedAt ? new Date(t.updatedAt).toLocaleString('pt-BR') : 'N/A'}\n`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
