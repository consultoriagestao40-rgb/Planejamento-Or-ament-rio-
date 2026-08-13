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
        console.log('--- ENTRADAS DE FATURAMENTO POR EMPRESA EM JUNHO 2026 ---');
        
        const tenants = await prisma.tenant.findMany();
        
        for (const t of tenants) {
            console.log(`\nEmpresa: ${t.name}`);
            
            const revenueFilter = {
                category: {
                    OR: [
                        { type: 'REVENUE' },
                        { name: { startsWith: '01' } },
                        { name: { startsWith: '1.' } }
                    ]
                }
            };

            // Caixa
            const caixa = await prisma.realizedEntry.aggregate({
                where: { tenantId: t.id, year: 2026, month: 6, viewMode: 'caixa', ...revenueFilter },
                _count: true,
                _sum: { amount: true }
            });
            
            // Competencia
            const comp = await prisma.realizedEntry.aggregate({
                where: { tenantId: t.id, year: 2026, month: 6, viewMode: 'competencia', ...revenueFilter },
                _count: true,
                _sum: { amount: true }
            });

            // Previsto Receber
            const prevRec = await prisma.realizedEntry.aggregate({
                where: { tenantId: t.id, year: 2026, month: 6, viewMode: 'previsto_receber', ...revenueFilter },
                _count: true,
                _sum: { amount: true }
            });

            console.log(`  - Realizado Caixa (Recebimentos): R$ ${caixa._sum.amount || 0} (${caixa._count} transações)`);
            console.log(`  - Realizado Competência (DRE):    R$ ${comp._sum.amount || 0} (${comp._count} transações)`);
            console.log(`  - Previsto Receber (Aberto):      R$ ${prevRec._sum.amount || 0} (${prevRec._count} transações)`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
