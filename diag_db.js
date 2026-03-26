const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const t = await prisma.tenant.findFirst({ where: { name: { contains: 'FACILITIES', mode: 'insensitive' } } });
  if(!t) { console.log('Tenant not found'); return; }
  console.log('--- DIAGNOSTIC JVS FACILITIES ---');
  console.log('Tenant ID:', t.id);
  
  // Find budgets for ALL Revenue (01.*) to be sure
  const budgets = await prisma.budgetEntry.findMany({
    where: { tenantId: t.id, month: 1, year: 2026 },
    include: { costCenter: true, category: true }
  });
  
  console.log('\nBUDGETS for Jan 2026:');
  budgets.forEach(b => {
    if (b.category?.name?.includes('Serviços')) {
      console.log(`- Cat: ${b.category?.name} (${b.categoryId}), CC: ${b.costCenter?.name || 'Geral'} (${b.costCenterId}), Amount: ${b.amount}`);
    }
  });
  
  const ccs = await prisma.costCenter.findMany({ where: { tenantId: t.id } });
  console.log('\nALL COST CENTERS in DB for JVS FACILITIES:');
  ccs.forEach(c => {
    console.log(`- ID: ${c.id}, Name: ${c.name}`);
  });
}
run().catch(console.error).finally(() => prisma.$disconnect());
