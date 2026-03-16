const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenants = await prisma.tenant.findMany({
        where: { name: { contains: 'SPOT', mode: 'insensitive' } }
    });
    console.log('--- SPOT TENANTS ---');
    tenants.forEach(t => {
        console.log(`ID: ${t.id} | Name: ${t.name} | CNPJ: ${t.cnpj}`);
    });
    await prisma.$disconnect();
}

run();
