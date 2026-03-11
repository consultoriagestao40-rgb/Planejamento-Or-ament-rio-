import { prisma } from './src/lib/prisma';

async function main() {
    const ccs = await prisma.costCenter.findMany({
        where: { tenantId: { not: '' } },
        select: { id: true, name: true, tenantId: true }
    });
    console.log("Cost Centers in DB:");
    ccs.forEach(cc => console.log(`- [${cc.tenantId}] ID: ${cc.id} | Name: ${cc.name}`));
}

main();
