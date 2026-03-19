import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspect() {
    const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT
    const entry = await prisma.realizedEntry.findFirst({
        where: { tenantId, year: 2026, month: 1, viewMode: 'competencia' },
        orderBy: { updatedAt: 'desc' }
    });
    console.log(`Latest Update for SPOT Jan 2026: ${entry?.updatedAt}`);
    
    // Check one specific sale
    const sale = await prisma.realizedEntry.findFirst({
        where: { tenantId, description: { startsWith: 'Venda 638' } }
    });
    console.log(`Venda 638 Amount: ${sale?.amount}`);
}

inspect().catch(console.error).finally(() => prisma.$disconnect());
