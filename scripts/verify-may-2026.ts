import { prisma } from '../src/lib/prisma';

async function main() {
    console.log("=== VERIFYING MAY 2026 COMPETENCIA REALIZED ENTRIES ===");

    const JVS_ID = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
    const SPOT_ID = '413f88a7-ce4a-4620-b044-43ef909b7b26';

    const categories = await prisma.category.findMany();
    const catMap = new Map<string, string>();
    for (const cat of categories) {
        catMap.set(cat.id, cat.name);
    }

    const costCenters = await prisma.costCenter.findMany();
    const ccMap = new Map<string, string>();
    for (const cc of costCenters) {
        ccMap.set(cc.id, cc.name);
    }

    // 1. Verify JVS Facilities
    console.log("\n--------------------------------------------------");
    console.log("1. JVS FACILITIES (dc2b6eed-a38a-43c3-9465-ce854bfda90f)");
    console.log("--------------------------------------------------");
    const jvsEntries = await prisma.realizedEntry.findMany({
        where: {
            tenantId: JVS_ID,
            year: 2026,
            month: 5,
            viewMode: 'competencia'
        }
    });

    let jvsRevenue = 0;
    let jvsTaxes = 0;
    let jvsCosts = 0;
    let jvsExpenses = 0;
    let jvsFinance = 0;

    const jvsGrouped: Record<string, number> = {};
    for (const e of jvsEntries) {
        const catName = catMap.get(e.categoryId) || e.categoryId;
        jvsGrouped[catName] = (jvsGrouped[catName] || 0) + e.amount;

        if (catName.startsWith("01.")) jvsRevenue += e.amount;
        else if (catName.startsWith("02.") || catName.startsWith("2.")) jvsTaxes += e.amount;
        else if (catName.startsWith("03.")) jvsCosts += e.amount;
        else if (catName.startsWith("04.") || catName.startsWith("05.")) jvsExpenses += e.amount;
        else if (catName.startsWith("06.")) jvsFinance += e.amount;
    }

    console.log("\nSummary by category group:");
    console.log(`- Receita Bruta (Grupo 01): R$ ${jvsRevenue.toFixed(2)}`);
    console.log(`- Tributos (Grupo 02): R$ ${jvsTaxes.toFixed(2)}`);
    console.log(`- Custos Operacionais (Grupo 03): R$ ${jvsCosts.toFixed(2)}`);
    console.log(`- Despesas Operacionais/Administrativas (Grupo 04/05): R$ ${jvsExpenses.toFixed(2)}`);
    console.log(`- Despesas Financeiras (Grupo 06): R$ ${jvsFinance.toFixed(2)}`);

    console.log("\nDetailed Category Breakdown:");
    for (const [catName, sum] of Object.entries(jvsGrouped).sort()) {
        console.log(`  * ${catName.padEnd(50)}: R$ ${sum.toFixed(2)}`);
    }


    // 2. Verify Spot Facilities
    console.log("\n--------------------------------------------------");
    console.log("2. SPOT FACILITIES (413f88a7-ce4a-4620-b044-43ef909b7b26)");
    console.log("--------------------------------------------------");
    const spotEntries = await prisma.realizedEntry.findMany({
        where: {
            tenantId: SPOT_ID,
            year: 2026,
            month: 5,
            viewMode: 'competencia'
        }
    });

    let spotRevenue = 0;
    let spotTaxes = 0;
    let spotCosts = 0;
    let spotExpenses = 0;
    let spotFinance = 0;

    const spotGrouped: Record<string, number> = {};
    for (const e of spotEntries) {
        const catName = catMap.get(e.categoryId) || e.categoryId;
        spotGrouped[catName] = (spotGrouped[catName] || 0) + e.amount;

        if (catName.startsWith("01.")) spotRevenue += e.amount;
        else if (catName.startsWith("02.") || catName.startsWith("2.")) spotTaxes += e.amount;
        else if (catName.startsWith("03.")) spotCosts += e.amount;
        else if (catName.startsWith("04.") || catName.startsWith("05.")) spotExpenses += e.amount;
        else if (catName.startsWith("06.")) spotFinance += e.amount;
    }

    console.log("\nSummary by category group:");
    console.log(`- Receita Bruta (Grupo 01): R$ ${spotRevenue.toFixed(2)}`);
    console.log(`- Tributos (Grupo 02): R$ ${spotTaxes.toFixed(2)}`);
    console.log(`- Custos Operacionais (Grupo 03): R$ ${spotCosts.toFixed(2)}`);
    console.log(`- Despesas Operacionais/Administrativas (Grupo 04/05): R$ ${spotExpenses.toFixed(2)}`);
    console.log(`- Despesas Financeiras (Grupo 06): R$ ${spotFinance.toFixed(2)}`);

    console.log("\nDetailed Category Breakdown:");
    for (const [catName, sum] of Object.entries(spotGrouped).sort()) {
        console.log(`  * ${catName.padEnd(50)}: R$ ${sum.toFixed(2)}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
