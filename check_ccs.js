const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const ccs = await prisma.costCenter.findMany({
        include: { tenant: true }
    });
    console.log(`Total CCs: ${ccs.length}`);
    
    ccs.forEach(cc => {
        const isInativo = cc.name.includes('[INATIVO]') || cc.name.toUpperCase().includes('ENCERRADO');
        if (isInativo) {
            console.log(`[FILTERED] ${cc.name} (Tenant: ${cc.tenant.name})`);
        } else {
            // console.log(`[KEEP] ${cc.name} (Tenant: ${cc.tenant.name})`);
        }
    });

    const spotCCs = ccs.filter(cc => cc.tenant.name.includes('SPOT'));
    console.log(`SPOT CCs Total: ${spotCCs.length}`);
    spotCCs.forEach(cc => console.log(`- ${cc.name} (ID: ${cc.id})`));
}

check().catch(console.error);
