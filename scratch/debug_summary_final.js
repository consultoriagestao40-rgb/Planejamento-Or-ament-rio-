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
        const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS TRATAMENTOS
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                year: 2026,
                month: 6,
                viewMode: 'caixa'
            },
            include: {
                category: true
            }
        });

        console.log(`Encontrados ${entries.length} lançamentos de Caixa em Junho/2026 para JVS Tratamentos.`);

        const categoryCounts = {};
        entries.forEach(e => {
            const catName = e.category.name;
            const isRev = e.category.type === 'REVENUE' || catName.startsWith('01') || catName.startsWith('1.');
            const key = `[${isRev ? 'RECEITA' : 'DESPESA'}] ${catName}`;
            
            if (!categoryCounts[key]) {
                categoryCounts[key] = { count: 0, sum: 0 };
            }
            categoryCounts[key].count++;
            categoryCounts[key].sum += e.amount;
        });

        console.log('\nResumo de lançamentos de Caixa por categoria:');
        console.log(JSON.stringify(categoryCounts, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
