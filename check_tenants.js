const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, accessToken: true }
  });
  console.log(tenants.map(t => ({ id: t.id, name: t.name, hasToken: !!t.accessToken })));
}
main().finally(() => prisma.$disconnect());
