const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const years = await prisma.budgetEntry.groupBy({
        by: ['year'],
        _count: true
    });
    console.log('Years in BudgetEntry:', years);
    
    // Check first 5 entries
    const sample = await prisma.budgetEntry.findMany({ take: 5 });
    console.log('Sample BudgetEntries:', JSON.stringify(sample, null, 2));
}

check().catch(console.error);
