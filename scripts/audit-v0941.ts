
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function audit() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    const jvs = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });

    if (spot) {
        const spotRealized = await prisma.realizedEntry.aggregate({
            _sum: { amount: true },
            where: { tenantId: spot.id, year: 2026, month: 1, amount: { gt: 0 } }
        });
        console.log(`SPOT Revenue Jan 2026: ${spotRealized._sum.amount}`);
        
        const spotExpenses = await prisma.realizedEntry.aggregate({
            _sum: { amount: true },
            where: { tenantId: spot.id, year: 2026, month: 1, amount: { lt: 0 } }
        });
        console.log(`SPOT Expenses Jan 2026: ${spotExpenses._sum.amount}`);
    }

    if (jvs) {
        const jvsRealized = await prisma.realizedEntry.aggregate({
            _sum: { amount: true },
            where: { tenantId: jvs.id, year: 2026, month: 1, amount: { gt: 0 } }
        });
        console.log(`JVS Revenue Jan 2026: ${jvsRealized._sum.amount}`);
    }
}

audit().finally(() => prisma.$disconnect());
