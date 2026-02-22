
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking CostCenters...");
    const ccs = await prisma.costCenter.findMany();
    console.log("CostCenters count:", ccs.length);
    console.log("CostCenter IDs:", ccs.map(cc => cc.id));

    console.log("\nChecking BudgetEntries count...");
    const count = await prisma.budgetEntry.count();
    console.log("Total entries:", count);

    if (count > 0) {
        const sample = await prisma.budgetEntry.findFirst();
        console.log("Sample entry:", JSON.stringify(sample, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
