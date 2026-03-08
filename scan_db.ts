import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({
    where: { name: { contains: "Salários" } }
  });
  console.log("== Categories MATCHING 'Salários' ==");
  cats.forEach((c: any) => console.log(c.id, c.name, c.tenantId));

  const catIds = cats.map((c: any) => c.id);

  const budgets = await prisma.budgetEntry.findMany({
    where: { 
        categoryId: { in: catIds },
        year: 2025,
        month: { in: [3, 4, 5] }
    }
  });

  console.log("== BUDGET ENTRIES FOR THESE CATEGORIES ==");
  budgets.forEach((b: any) => console.log(`Cat: ${b.categoryId}, Month: ${b.month}, CC: ${b.costCenterId}, Tenant: ${b.tenantId}, B: ${b.amount}, R: ${b.radarAmount}`));

}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
