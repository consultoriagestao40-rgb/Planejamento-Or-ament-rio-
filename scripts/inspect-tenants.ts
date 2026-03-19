import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspect() {
    const tenants = await prisma.tenant.findMany();
    console.log(`Found ${tenants.length} tenants:`);
    tenants.forEach(t => {
        console.log(`- ${t.name} (CNPJ: ${t.cnpj}) | ID: ${t.id}`);
    });
}

inspect().catch(console.error).finally(() => prisma.$disconnect());
