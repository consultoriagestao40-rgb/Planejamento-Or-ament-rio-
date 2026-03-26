const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- JAN/2026 BUDGET DATA DUMP ---");
    const janBudgets = await prisma.budgetEntry.findMany({
        where: { year: 2026, month: 1 },
        include: { category: true }
    });

    console.log(`Total records for Jan/2026: ${janBudgets.length}`);

    // Filter by the category name prefix "01.1" or "1.1"
    const targetBudgets = janBudgets.filter(b => 
        (b.category?.name || "").includes("01.1") || 
        (b.category?.name || "").includes("1.1") ||
        (b.category?.name || "").toUpperCase().includes("SERVIÇOS")
    );

    console.log("MATCHING BUDGETS:");
    targetBudgets.forEach(b => {
        console.log(`- ID: ${b.id}, CatID: ${b.categoryId}, CatName: "${b.category?.name}", Amount: ${b.amount}, Tenant: ${b.tenantId}`);
    });

    // Check specific IDs passed from modal (01.1)
    const exactIdMatch = janBudgets.filter(b => b.categoryId === "01.1");
    console.log(`Exact Match for "01.1": ${exactIdMatch.length}`);

}

main().catch(console.error).finally(() => prisma.$disconnect());
