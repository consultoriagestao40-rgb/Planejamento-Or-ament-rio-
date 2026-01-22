const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.tenant.count();
    console.log('Tenant count:', count);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
