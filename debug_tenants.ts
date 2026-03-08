import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log("== TENANTS ==");
  tenants.forEach(t => console.log(`${t.id} | ${t.name}`));

  const budgetCount = await prisma.budgetEntry.count();
  console.log("\nTotal Budget Entries:", budgetCount);

  const countsByTenant = await prisma.budgetEntry.groupBy({
    by: ['tenantId'],
    _count: true
  });
  console.log("\n== Budget Entries by TenantId ==");
  countsByTenant.forEach(c => console.log(`${c.tenantId || 'NULL'} : ${c._count}`));

  // Find recent entries for Spot Facilities specifically if we can identify it
  const spot = tenants.find(t => t.name.includes("Spot"));
  if (spot) {
      console.log(`\n== Recent entries for ${spot.name} (${spot.id}) ==`);
      const recent = await prisma.budgetEntry.findMany({
          where: { tenantId: spot.id },
          take: 5,
          orderBy: { id: 'desc' }
      });
      recent.forEach(r => console.log(`Cat: ${r.categoryId}, Month: ${r.month}, CC: ${r.costCenterId}, Amt: ${r.amount}`));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
