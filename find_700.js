const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.budgetEntry.findMany({
    where: {
      OR: [
        { amount: 700 },
        { amount: -700 },
        { radarAmount: 700 }
      ]
    },
    select: { id: true, categoryId: true, costCenterId: true, tenantId: true, amount: true, month: true, year: true }
  });
  console.log('--- ENTRIES FETCHED ---');
  entries.forEach(e => console.log(`${e.id} | ${e.amount} | CC: ${e.costCenterId} | T: ${e.tenantId} | M: ${e.month}`));
  
  const cat = await prisma.category.findMany({
    where: { name: { contains: 'Perdas' } }
  });
  console.log('\n--- CATEGORIES (Perdas) ---');
  cat.forEach(c => console.log(`${c.id} | ${c.name} | T: ${c.tenantId}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
