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
}
main().finally(() => prisma.$disconnect());
