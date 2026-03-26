import { prisma } from './src/lib/prisma';

async function check() {
  const types = await prisma.category.groupBy({
    by: ['type'],
    _count: true
  });
  console.log('Category Types:', JSON.stringify(types, null, 2));

  const budgetCheck = await prisma.budgetEntry.findFirst({
    include: { category: true }
  });
  console.log('Sample Budget Entry:', JSON.stringify(budgetCheck, null, 2));
}

check();
