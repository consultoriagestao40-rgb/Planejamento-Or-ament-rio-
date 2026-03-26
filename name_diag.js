const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const ccs = await prisma.costCenter.findMany({
    include: { tenant: true }
  });
  console.log('--- ALL COST CENTERS IN DB ---');
  ccs.forEach(c => {
    console.log(`- [${c.tenant?.name}] "${c.name}" ID: ${c.id}`);
  });
  
  const budgets = await prisma.budgetEntry.findMany({
    where: { month: 1, year: 2026 },
    include: { costCenter: true, tenant: true, category: true }
  });
  
  console.log('\n--- ALL BUDGETS Jan 2026 ---');
  budgets.forEach(b => {
    if (b.amount > 0) {
      console.log(`- Cat: [${b.category?.name}] Emp: [${b.tenant?.name}] CC: [${b.costCenter?.name || 'Geral'}] ID: ${b.costCenterId} Amt: ${b.amount}`);
    }
  });
}
run().catch(console.error).finally(() => prisma.$disconnect());
