const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== FORENSIC INVESTIGATION: JAN/2026 BUDGETS ===");
    
    // 1. Get ALL budget entries for Jan 2026
    const entries = await prisma.budgetEntry.findMany({
        where: { year: 2026, month: 1 },
        include: {
            category: { select: { id: true, name: true, tenantId: true } },
            tenant: { select: { id: true, name: true } }
        }
    });

    console.log(`Total entries found for Jan/2026: ${entries.length}`);

    // 2. Find the entries that sum up to our target (~587k)
    // Likely these are under "01.1" or its children "01.1.1", "01.1.2"
    const relevant = entries.filter(e => 
        (e.category?.name || "").includes("01.1") || 
        (e.category?.name || "").includes("1.1") ||
        (e.amount > 0)
    );

    console.log("\nRELEVANT ENTRIES (DNA):");
    relevant.forEach(e => {
        console.log(`- Amount: R$ ${e.amount.toLocaleString('pt-BR')}`);
        console.log(`  Category: [${e.categoryId}] "${e.category?.name}" (Tenant: ${e.category?.tenantId})`);
        console.log(`  Entry Tenant: [${e.tenantId}] "${e.tenant?.name}"`);
        console.log(`  CostCenter: ${e.costCenterId || 'GERAL'}`);
        console.log("-----------------------------------------");
    });

    // 3. Check what happens if we search for "01.1" hierarchy
    const allCats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
    const seeds = allCats.filter(c => c.name?.includes("01.1") || c.id === "01.1");
    console.log("\nSEARCH SEEDS FOR '01.1':", seeds.map(s => `[${s.id}] ${s.name}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
