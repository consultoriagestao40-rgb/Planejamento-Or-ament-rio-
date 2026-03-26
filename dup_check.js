const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const budgets = await prisma.budgetEntry.findMany({
    where: { month: 1, year: 2026 },
    include: { costCenter: true, tenant: true, category: true }
  });
  
  console.log('--- DUPLICATE CHECK Jan 2026 ---');
  budgets.forEach(b => {
    if (b.amount > 0 && b.tenant?.name?.includes('FACILITIES')) {
       console.log(`[${b.category?.name}] [${b.costCenter?.name || 'Geral'}] Amt: ${b.amount} ID: ${b.id}`);
    }
  });
}
run().catch(console.error).finally(() => prisma.$disconnect());
