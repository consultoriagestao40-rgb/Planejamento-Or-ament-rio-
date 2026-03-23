import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    try {
        console.log("Checking DB Connection...");
        const tenants = await prisma.tenant.findMany({ take: 1 });
        console.log("Connected. Tenants found:", tenants.length);

        console.log("Checking Category table fields...");
        const cats = await (prisma.category as any).findMany({ take: 1 });
        console.log("Categories sample:", JSON.stringify(cats, null, 2));

        console.log("Checking CostCenter table fields...");
        const ccs = await (prisma.costCenter as any).findMany({ take: 1 });
        console.log("CostCenters sample:", JSON.stringify(ccs, null, 2));

        const budgetCount = await prisma.budgetEntry.count();
        console.log("Total Budget Entries:", budgetCount);

        const realizedCount = await prisma.realizedEntry.count();
        console.log("Total Realized Entries:", realizedCount);

    } catch (e: any) {
        console.error("DB Check Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
