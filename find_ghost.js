const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const amount = 4985.35;
  const entries = await prisma.budgetEntry.findMany({
    where: {
      OR: [
        { amount: { gte: amount - 0.01, lte: amount + 0.01 } },
        { radarAmount: { gte: amount - 0.01, lte: amount + 0.01 } }
      ]
    },
    include: { category: true }
  });
  
  console.log('--- BUDGET ENTRIES FOUND ---');
  entries.forEach(e => {
    console.log(`ID: ${e.id} | Amount: ${e.amount} | Cat: ${e.category.name} (${e.categoryId}) | CC: ${e.costCenterId} | T: ${e.tenantId} | M: ${e.month}`);
  });

  const realized = await prisma.realizedEntry.findMany({
    where: {
        amount: { gte: amount - 0.01, lte: amount + 0.01 }
    },
    include: { category: true }
  });
  
  console.log('\n--- REALIZED ENTRIES FOUND ---');
  realized.forEach(e => {
    console.log(`ID: ${e.id} | Amount: ${e.amount} | Cat: ${e.category.name} (${e.categoryId}) | CC: ${e.costCenterId} | T: ${e.tenantId} | M: ${e.month}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
