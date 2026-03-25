import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({
    where: {
      OR: [
        { name: { contains: 'Venda' } },
        { name: { contains: 'Comissão' } },
        { name: { contains: 'DAS' } },
        { name: { contains: 'Simples' } }
      ]
    },
    select: { id: true, name: true, tenantId: true }
  });
  console.log('--- CATEGORIES ---');
  cats.forEach(c => console.log(`${c.id} | ${c.name} | ${c.tenantId}`));
  
  const entries = await prisma.budgetEntry.findMany({
    where: {
      categoryId: { in: cats.map(c => c.id) },
      month: 1, // Jan (0-indexed in UI, but maybe 1 in DB?)
      year: 2026
    }
  });
  console.log('\n--- BUDGET ENTRIES (Month 1/Jan) ---');
  entries.forEach(e => console.log(`${e.categoryId} | ${e.amount} | CC: ${e.costCenterId}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
