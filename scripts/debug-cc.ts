import { prisma } from '../src/lib/prisma';

async function test() {
    try {
        const ccs = await prisma.costCenter.findMany();
        console.log(`Found ${ccs.length} cost centers`);
        
        const tenant = await prisma.tenant.findFirst();
        if (tenant) {
            console.log("Testing createRealizedEntry...");
            // Just test if we can insert a RealizedEntry with a valid Category and Cost Center
            const cat = await prisma.category.findFirst({ where: { tenantId: tenant.id } });
            const cc = await prisma.costCenter.findFirst({ where: { tenantId: tenant.id } });
            
            if (cat && cc) {
                console.log(`Using cat ${cat.id} and cc ${cc.id}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}
test();
