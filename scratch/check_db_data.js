const fs = require('fs');
const path = require('path');

// Ler e injetar variáveis de ambiente manualmente
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
                    // Juntar o resto em caso de '=' no valor (ex: urls de conexão)
                    const val = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                    process.env[key] = val;
                }
            }
        });
    }
} catch (e) {
    console.error('Erro ao ler .env.development.local:', e);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- Analisando dados de Junho 2026 ---');
        
        // Contar por viewMode em junho de 2026
        const counts = await prisma.realizedEntry.groupBy({
            by: ['viewMode'],
            where: {
                year: 2026,
                month: 6
            },
            _count: true,
            _sum: {
                amount: true
            }
        });
        console.log('Resumo por viewMode em Junho/2026:', JSON.stringify(counts, null, 2));

        // Buscar categorias com valores em junho de 2026 para viewMode: 'caixa'
        const caixaCategories = await prisma.realizedEntry.findMany({
            where: {
                year: 2026,
                month: 6,
                viewMode: 'caixa'
            },
            include: {
                category: true
            }
        });
        
        console.log('\n--- Detalhamento de lançamentos tipo CAIXA em Junho/2026 ---');
        const caixaSummary = {};
        caixaCategories.forEach(e => {
            const catName = e.category.name;
            const isRevenue = e.category.type === 'REVENUE' || catName.startsWith('01') || catName.startsWith('1.');
            const key = `${isRevenue ? 'RECEITA' : 'DESPESA'} - ${catName}`;
            caixaSummary[key] = (caixaSummary[key] || 0) + e.amount;
        });
        console.log(JSON.stringify(caixaSummary, null, 2));

        // Buscar categorias com valores em junho de 2026 para viewMode: 'competencia'
        const competenciaCategories = await prisma.realizedEntry.findMany({
            where: {
                year: 2026,
                month: 6,
                viewMode: 'competencia'
            },
            include: {
                category: true
            }
        });
        
        console.log('\n--- Detalhamento de lançamentos tipo COMPETENCIA em Junho/2026 ---');
        const compSummary = {};
        competenciaCategories.forEach(e => {
            const catName = e.category.name;
            const isRevenue = e.category.type === 'REVENUE' || catName.startsWith('01') || catName.startsWith('1.');
            const key = `${isRevenue ? 'RECEITA' : 'DESPESA'} - ${catName}`;
            compSummary[key] = (compSummary[key] || 0) + e.amount;
        });
        console.log(JSON.stringify(compSummary, null, 2));

    } catch (err) {
        console.error('Erro no script:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
