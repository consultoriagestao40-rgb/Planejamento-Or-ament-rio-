const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  const jvs = tenants.find(t => t.name.includes("JVS"));
  if (!jvs) {
    console.log("JVS tenant not found! Available tenants:");
    tenants.forEach(t => console.log(`- ${t.name} (ID: ${t.id})`));
    return;
  }
  
  console.log(`Found tenant: ${jvs.name} (ID: ${jvs.id})`);
  
  const ccs = await prisma.costCenter.findMany({
    where: { tenantId: jvs.id },
    orderBy: { name: 'asc' }
  });
  
  console.log(`Total cost centers found for JVS: ${ccs.length}`);
  ccs.forEach(cc => {
    console.log(`- ID: ${cc.id} | Name: "${cc.name}"`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
