import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING BANK ACCOUNTS IN DATABASE ===");
  try {
    const bankAccounts = await prisma.bankAccount.findMany({
      include: { tenant: true }
    });
    console.log(`Found ${bankAccounts.length} bank accounts in the database.`);
    bankAccounts.forEach(acc => {
      console.log(`- ID: ${acc.id}, Name: ${acc.name}, Balance: ${acc.balance}, Tenant: ${acc.tenant.name} (${acc.tenantId})`);
    });

    const tenants = await prisma.tenant.findMany();
    console.log(`Found ${tenants.length} tenants total.`);
    tenants.forEach(t => {
      console.log(`- Tenant: ${t.name}, ID: ${t.id}, HasToken: ${!!t.accessToken}`);
    });
  } catch (error) {
    console.error("Error checking bank accounts:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
