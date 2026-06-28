const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Get all tenants
    const tenants = await prisma.tenant.findMany();
    console.log("=== TENANTS ===");
    tenants.forEach(t => console.log(`- ${t.name}: ID=${t.id}`));

    // 2. Find categories containing "Receita Bruta" or starting with "01."
    const categories = await prisma.category.findMany();
    const targetCats = categories.filter(c => {
        const name = c.name.toUpperCase();
        return name.includes("RECEITA BRUTA") || name.startsWith("01.") || name.startsWith("1.");
    });
    console.log("\n=== TARGET CATEGORIES ===");
    targetCats.forEach(c => {
        const tName = tenants.find(t => t.id === c.tenantId)?.name || 'Unknown';
        console.log(`- [${tName}] ${c.name}: ID=${c.id}, Type=${c.type}`);
    });

    const catIds = targetCats.map(c => c.id);

    // 3. Query all budgets and realized for 2026 (Jan to Jun)
    const budgets = await prisma.budgetEntry.findMany({
        where: {
            year: 2026,
            month: { in: [1,2,3,4,5,6] },
            categoryId: { in: catIds }
        }
    });

    const realized = await prisma.realizedEntry.findMany({
        where: {
            year: 2026,
            month: { in: [1,2,3,4,5,6] },
            viewMode: 'competencia',
            categoryId: { in: catIds }
        }
    });

    // 4. Deduplicate synced months
    const syncedMonths = new Set();
    realized.forEach(e => {
        if (e.externalId && e.externalId.startsWith('sync-')) {
            syncedMonths.add(`${e.tenantId}|${e.year}|${e.month}`);
        }
    });

    const realizedDeduped = realized.filter(e => {
        const key = `${e.tenantId}|${e.year}|${e.month}`;
        if (syncedMonths.has(key)) {
            return e.externalId && e.externalId.startsWith('sync-');
        }
        return true;
    });

    // 5. Aggregate by month
    const monthly = {};
    for (let m = 1; m <= 6; m++) {
        monthly[m] = { budget: 0, realized: 0, realizedWithSyncCheck: 0 };
    }

    budgets.forEach(b => {
        monthly[b.month].budget += b.amount;
    });

    realized.forEach(r => {
        // Without deduplication just to compare
        monthly[r.month].realized += r.amount;
    });

    realizedDeduped.forEach(r => {
        monthly[r.month].realizedWithSyncCheck += r.amount;
    });

    console.log("\n=== MONTHLY CONSOLIDATED SUMMARY (Jan-Jun 2026) ===");
    console.log("Month | Budget | Realized (No Dedup) | Realized (Deduped/Correct)");
    console.log("-----------------------------------------------------------------");
    let totalB = 0, totalR = 0, totalRD = 0;
    for (let m = 1; m <= 6; m++) {
        const bVal = monthly[m].budget;
        const rVal = monthly[m].realized;
        const rdVal = monthly[m].realizedWithSyncCheck;
        totalB += bVal;
        totalR += rVal;
        totalRD += rdVal;
        console.log(`${String(m).padStart(5)} | ${bVal.toFixed(2).padStart(12)} | ${rVal.toFixed(2).padStart(19)} | ${rdVal.toFixed(2).padStart(26)}`);
    }
    console.log("-----------------------------------------------------------------");
    console.log(`Total | ${totalB.toFixed(2).padStart(12)} | ${totalR.toFixed(2).padStart(19)} | ${totalRD.toFixed(2).padStart(26)}`);

    // Let's also see detail by tenant to understand where the numbers come from
    console.log("\n=== DETAILS BY TENANT ===");
    for (const t of tenants) {
        console.log(`Tenant: ${t.name}`);
        const tCats = targetCats.filter(c => c.tenantId === t.id);
        const tCatIds = tCats.map(c => c.id);
        
        for (let m = 1; m <= 6; m++) {
            const bSum = budgets.filter(b => b.tenantId === t.id && b.month === m).reduce((s, x) => s + x.amount, 0);
            const rSum = realized.filter(r => r.tenantId === t.id && r.month === m).reduce((s, x) => s + x.amount, 0);
            const rdSum = realizedDeduped.filter(r => r.tenantId === t.id && r.month === m).reduce((s, x) => s + x.amount, 0);
            if (bSum > 0 || rSum > 0 || rdSum > 0) {
                console.log(`  Month ${m}: Budget=${bSum.toFixed(2)}, RealizedRaw=${rSum.toFixed(2)}, RealizedDedup=${rdSum.toFixed(2)}`);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
