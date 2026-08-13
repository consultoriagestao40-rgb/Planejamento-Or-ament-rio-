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
        console.log('--- CONTAGEM DE LANÇAMENTOS TOTAIS EM 2026 ---');
        
        const summary = await prisma.realizedEntry.groupBy({
            by: ['tenantId', 'viewMode'],
            where: { year: 2026 },
            _count: true,
            _sum: { amount: true }
        });

        // Buscar nomes dos tenants
        const tenants = await prisma.tenant.findMany();
        const tenantMap = {};
        tenants.forEach(t => { tenantMap[t.id] = t.name; });

        summary.forEach(s => {
            console.log(`Empresa: ${tenantMap[s.tenantId] || s.tenantId}`);
            console.log(`  - Modo:  ${s.viewMode}`);
            console.log(`  - Quant: ${s._count} lançamentos`);
            console.log(`  - Soma:  R$ ${s._sum.amount || 0}\n`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
