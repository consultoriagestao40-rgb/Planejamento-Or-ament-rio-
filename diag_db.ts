import { prisma } from './src/lib/prisma';

async function diag() {
  const ccId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // From screenshot
  const year = 2026;
  
  const entries = await prisma.budgetEntry.findMany({
    where: { costCenterId: ccId, year },
    include: { category: true }
  });
  
  console.log(JSON.stringify(entries.map(e => ({
    id: e.id,
    catName: e.category.name,
    catId: e.categoryId,
    month: e.month,
    amount: e.amount,
    tenantId: e.tenantId
  })), null, 2));
}

diag().catch(console.error);
