const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const finalCategoryId = "cm7q0r0s2001oic6v8z2iifk1"; // Example category for testing (Pró-labore?)
  const targetCCId = "cm7q3u8er0003y4f7u306wcv5"; // Example CC Admin
  const currentTenantId = "cm7q0my590000ic6viid6k7ce";
  const dbMonth = 1;
  const dbYear = 2026;
  
  // Nuclear cleanup sim
  await prisma.budgetEntry.deleteMany({
    where: { categoryId: finalCategoryId, month: dbMonth, year: dbYear, costCenterId: targetCCId }
  });
  console.log("Deleted");
  
  // Create sim
  const budget = await prisma.budgetEntry.create({
    data: {
      categoryId: finalCategoryId,
      month: dbMonth,
      year: dbYear,
      amount: 9621,
      observation: "Pró-labore do Vanderlei",
      costCenterId: targetCCId,
      tenantId: currentTenantId,
      isLocked: false,
      radarAmount: null,
      compositionItems: {
          create: []
      }
    }
  });
  console.log("Created:", budget);
  
  // Read back
  const readBack = await prisma.budgetEntry.findFirst({
    where: { id: budget.id }, include: { compositionItems: true }
  });
  console.log("Read back:", readBack);
  
}
run().catch(console.error).finally(() => prisma.$disconnect());
