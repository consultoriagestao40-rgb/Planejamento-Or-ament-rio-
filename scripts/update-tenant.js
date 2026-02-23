const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany();
    console.log("Current tenants:", tenants.map(t => ({ id: t.id, name: t.name, cnpj: t.cnpj })));

    if (tenants.length > 0) {
        const updated = await prisma.tenant.update({
            where: { id: tenants[0].id },
            data: { name: 'SPOT FACILITIES' }
        });
        console.log("Updated tenant:", updated.name);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
