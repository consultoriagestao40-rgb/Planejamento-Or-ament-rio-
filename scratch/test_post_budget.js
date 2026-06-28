const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const finalCategoryId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:01.1.1 -Serviços Vendidos';
    const currentTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
    const firstCC = '5ee294c0-a5e6-11ef-8521-831ac6abba1c';
    const targetCCId = `${currentTenantId}:${firstCC}`;

    console.log("Checking if CostCenter exists in DB:", targetCCId);
    const cc = await prisma.costCenter.findUnique({
      where: { id: targetCCId }
    });
    console.log("CostCenter in DB:", cc);

    console.log("Checking if Category exists in DB:", finalCategoryId);
    const cat = await prisma.category.findUnique({
      where: { id: finalCategoryId }
    });
    console.log("Category in DB:", cat);

    console.log("Attempting to insert a budget entry...");
    const entry = await prisma.budgetEntry.create({
      data: {
        categoryId: finalCategoryId,
        month: 7,
        year: 2026,
        amount: 70000,
        costCenterId: targetCCId,
        tenantId: currentTenantId
      }
    });
    console.log("Successfully created budget entry:", entry);

    // Clean up
    await prisma.budgetEntry.delete({
      where: { id: entry.id }
    });
    console.log("Cleaned up successfully.");

  } catch (err) {
    console.error("Prisma error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
