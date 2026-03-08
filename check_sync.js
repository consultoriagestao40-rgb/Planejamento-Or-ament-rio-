const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking database sync status...");
  try {
    const tenants = await prisma.tenant.findMany({
      take: 1
    });
    console.log("Successfully queried Tenant table.");
    if (tenants.length > 0) {
      console.log("Sample tenant data:", JSON.stringify(tenants[0]));
      if ('taxRate' in tenants[0]) {
        console.log("taxRate field is present in the database results.");
      } else {
        console.log("taxRate field is NOT present in the database results.");
      }
    } else {
      console.log("No tenants found.");
    }
  } catch (error) {
    console.error("Database query failed!");
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
