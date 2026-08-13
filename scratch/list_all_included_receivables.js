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
        console.log('--- BUSCANDO TODOS OS SERVIÇOS VENDIDOS PARA JVS TRATAMENTOS EM 2026 ---');
        
        const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS TRATAMENTOS
        
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                year: 2026,
                category: {
                    name: { contains: 'Serviços Vendidos' }
                }
            },
            select: {
                month: true,
                viewMode: true,
                amount: true,
                description: true,
                date: true,
                externalId: true
            }
        });

        console.log(`Total encontrado: ${entries.length} lançamentos`);
        
        // Agrupar e resumir
        const summary = {};
        entries.forEach(e => {
            const key = `Mês ${e.month} | ${e.viewMode}`;
            summary[key] = (summary[key] || 0) + e.amount;
        });

        console.log('\nResumo agrupado:');
        console.log(JSON.stringify(summary, null, 2));

        console.log('\nAmostra dos primeiros 10 lançamentos:');
        console.log(JSON.stringify(entries.slice(0, 10), null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
