const fs = require('fs');
const path = require('path');

// Manually parse .env.development.local
try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.development.local'), 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
} catch (err) {
    console.error("Could not load .env.development.local:", err.message);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Let's import the GET function from src/app/api/dfc/route.ts by simulating it
async function main() {
    const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
    const year = 2026;
    const costCenterId = '';
    const defaultRate = 0;
    const overdueAction = 'today';

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayTime = new Date(todayStr).getTime();

    // 1. Get bank balance
    const bankAccounts = await prisma.bankAccount.findMany({ where: { tenantId } });
    const currentBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    // 2. Realized
    const realizedEntries = await prisma.realizedEntry.findMany({
        where: {
            tenantId,
            viewMode: 'caixa',
            year
        },
        include: { category: true }
    });

    // 3. Expected
    const expectedEntries = await prisma.realizedEntry.findMany({
        where: {
            tenantId,
            viewMode: { in: ['previsto_receber', 'previsto_pagar'] },
            year
        },
        include: { category: true }
    });

    // Let's calculate the totals as they are calculated in the DFC page
    let inflows = 0;
    let outflows = 0;
    
    // We group by month to match monthlyData structure
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        details: []
    }));

    // Process expected entries into monthlyData
    expectedEntries.forEach(entry => {
        const origDate = entry.date ? new Date(entry.date) : new Date(year, entry.month - 1, 15);
        const isRevenue = entry.viewMode === 'previsto_receber';
        let projDate = new Date(origDate);
        let isOverdue = origDate.getTime() < todayTime;

        if (isOverdue && overdueAction === 'today') {
            projDate = new Date(today);
        }

        const monthIdx = projDate.getMonth();
        if (projDate.getFullYear() === year && monthIdx >= 0 && monthIdx < 12) {
            monthlyData[monthIdx].details.push({
                amount: entry.amount,
                isRevenue,
                isRealized: false
            });
        }
    });

    // Now calculate inflows/outflows for cardTotals in DFC page
    const curYear = today.getFullYear();
    const curMonthIdx = today.getMonth();

    monthlyData.forEach(m => {
        const isPastOrCurrentMonth = 
            year < curYear || 
            (year === curYear && (m.month - 1) <= curMonthIdx);
            
        m.details.forEach(d => {
            if (!d.isRealized) {
                if (d.isRevenue) {
                    if (isPastOrCurrentMonth) inflows += d.amount;
                } else {
                    if (isPastOrCurrentMonth) outflows += d.amount;
                }
            }
        });
    });

    console.log("=== CALCULATED DFC CARD TOTALS FOR JVS FACILITIES ===");
    console.log(`Saldo Bancário Consolidado: R$ ${currentBankBalance.toFixed(2)}`);
    console.log(`Recebimentos em Aberto (Jan-Jul): R$ ${inflows.toFixed(2)}`);
    console.log(`Pagamentos em Aberto (Jan-Jul): R$ ${outflows.toFixed(2)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
