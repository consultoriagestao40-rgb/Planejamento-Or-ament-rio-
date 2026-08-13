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

function classifyCategory(categoryName, isRevenue, isConsolidated) {
    const name = categoryName.toUpperCase().trim();
    
    const isTax = 
        name.startsWith('02') || name.startsWith('2.') || 
        name.includes('SIMPLES NACIONAL') || name.includes(' DAS') || name.includes('- DAS') ||
        name.includes('TRIBUTO') || name.includes('IMPOSTO');
    if (isTax) {
        return 'OPERATIONAL_OUT';
    }
    
    const isInternalTransfer = 
        name.startsWith('06.1.2') || name.startsWith('06.2.2') || 
        name.startsWith('6.1.2') || name.startsWith('6.2.2');
        
    const isIntercompanyTransfer = 
        name.startsWith('06.1.1') || name.startsWith('06.2.1') || 
        name.startsWith('6.1.1') || name.startsWith('6.2.1');

    if (isInternalTransfer) {
        return 'TRANSFER';
    }

    if (isIntercompanyTransfer) {
        return isConsolidated ? 'TRANSFER' : 'FINANCING';
    }

    const isGroup06Financing = 
        name.startsWith('06.1.5') || name.startsWith('06.3.1') || 
        name.startsWith('06.1.6') || name.startsWith('06.3.2') ||
        name.startsWith('6.1.5') || name.startsWith('6.3.1') || 
        name.startsWith('6.1.6') || name.startsWith('6.3.2');

    const isCapex = name.startsWith('07') || name.startsWith('7.') || 
                    name.includes('CAPEX') || name.includes('INVESTIMENTO') || name.includes('IMOBILIZADO');
    if (isCapex) {
        return 'CAPEX';
    }
    
    const isFinancing = name.startsWith('08') || name.startsWith('8.') || 
                        isGroup06Financing ||
                        name.includes('FINANCIAMENTO') || name.includes('EMPRESTIMO') || name.includes('EMPRÉSTIMO') ||
                        name.includes('SÓCIO') || name.includes('SOCIO') || name.includes('APORTE') ||
                        name.includes('MÚTUO') || name.includes('MUTUO');
    if (isFinancing) {
        return 'FINANCING';
    }
    
    return isRevenue ? 'OPERATIONAL_IN' : 'OPERATIONAL_OUT';
}

async function main() {
    try {
        const today = new Date();
        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                viewMode: 'caixa',
                year: 2026,
                month: 6
            },
            include: { category: true }
        });

        const expectedEntries = await prisma.realizedEntry.findMany({
            where: {
                viewMode: { in: ['previsto_receber', 'previsto_pagar'] },
                year: 2026,
                month: 6
            },
            include: { category: true }
        });

        console.log('Quantidade de Realizados (Caixa) em Junho/2026:', realizedEntries.length);
        console.log('Quantidade de Previstos em Junho/2026:', expectedEntries.length);

        let opInRealized = 0;
        let opInExpected = 0;

        const detailsList = [];

        realizedEntries.forEach(entry => {
            const isRevenue = entry.category.type === 'REVENUE' || entry.category.name.startsWith('01') || entry.category.name.startsWith('1.');
            const dfcClass = classifyCategory(entry.category.name, isRevenue, true);
            if (dfcClass === 'OPERATIONAL_IN') {
                opInRealized += entry.amount;
                detailsList.push({
                    type: 'CAIXA_OPERATIONAL_IN',
                    category: entry.category.name,
                    description: entry.description,
                    amount: entry.amount,
                    date: entry.date
                });
            }
        });

        expectedEntries.forEach(entry => {
            const isRevenue = entry.viewMode === 'previsto_receber';
            const dfcClass = classifyCategory(entry.category.name, isRevenue, true);
            if (dfcClass === 'OPERATIONAL_IN') {
                opInExpected += entry.amount;
                detailsList.push({
                    type: 'PREVISTO_OPERATIONAL_IN',
                    category: entry.category.name,
                    description: entry.description,
                    amount: entry.amount,
                    date: entry.date
                });
            }
        });

        console.log('\nSoma de CAIXA OPERATIONAL_IN:', opInRealized);
        console.log('Soma de PREVISTO OPERATIONAL_IN:', opInExpected);
        console.log('Faturamento Total Computado:', opInRealized + opInExpected);
        
        console.log('\n--- Transações que compõem o Faturamento de Junho ---');
        console.log(JSON.stringify(detailsList, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
