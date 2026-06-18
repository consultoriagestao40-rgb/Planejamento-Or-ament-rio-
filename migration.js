const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning orphaned RealizedJustifications to allow Prisma Push...");
  try {
    const result = await prisma.$executeRawUnsafe(`DELETE FROM "RealizedJustification" WHERE "categoryId" NOT IN (SELECT id FROM "Category")`);
    console.log("Deleted orphans:", result);
  } catch (e) {
    console.error("Error during orphan cleanup:", e);
  }

  console.log("Updating JVS Facilities financial category metadata...");
  try {
    const categoriesToUpdate = [
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:58736492-9937-4b52-b10f-247fdbbc49ad', // 06.1.1
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:8ff72ab7-c678-4170-a7dd-c2b328079fc7', // 06.1.2
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:4ae92803-c09c-4357-a085-218bf108b912', // 06.1.7
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:edc92b2c-cdb0-44d5-bc69-2055b9365860', // 06.2.1
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:e88cba21-a650-4796-9b6c-574968222933', // 06.2.2
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2bc501cd-8fb4-43fe-9f93-c704daf7d20a', // 06.3.1
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b'  // 06.4.1
    ];
    const updateResult = await prisma.category.updateMany({
      where: { id: { in: categoriesToUpdate } },
      data: { entradaDre: '06. DESPESAS FINANCEIRAS' }
    });
    console.log("Updated JVS finance categories:", updateResult);
  } catch (e) {
    console.error("Error updating JVS finance categories:", e);
  }
}
main().finally(() => prisma.$disconnect());
