import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const tenantName = 'SPOT FACILITIES';
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: tenantName } } });
    if (!tenant) { console.log('Tenant not found'); return; }

    console.log(`--- AUDIT FOR ${tenant.name} (${tenant.id}) JAN/2026 ---`);
    
    // Get all categories for context
    const allCats = await prisma.category.findMany();
    const catMap = new Map(allCats.map(c => [c.id, c.name]));

    const entries = await prisma.realizedEntry.findMany({
        where: { tenantId: tenant.id, year: 2026, month: 1, viewMode: 'competencia' },
        orderBy: { amount: 'desc' }
    });

    let total = 0;
    console.log('ID | Category | Amount');
    entries.forEach(e => {
        console.log(`${e.id} | ${catMap.get(e.categoryId) || e.categoryId} | ${e.amount}`);
        total += e.amount;
    });
    console.log(`TOTAL: ${total}`);
}

check().catch(console.error).finally(() => prisma.$disconnect());
