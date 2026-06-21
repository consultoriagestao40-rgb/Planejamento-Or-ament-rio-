const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== DB Diagnosis ===");
    
    // 1. Tenants
    const tenants = await prisma.tenant.findMany();
    console.log("\nTenants in DB:");
    tenants.forEach(t => {
        console.log(`- ID: ${t.id}, Name: ${t.name}, CNPJ: ${t.cnpj}`);
    });

    // Find JVS Tratamentos
    const jvsTrat = tenants.find(t => t.name.toUpperCase().includes('TRATAMENTOS') || t.name.toUpperCase().includes('TRATMENTOS'));
    if (!jvsTrat) {
        console.log("\nCould not find a tenant matching 'TRATMENTOS'!");
        return;
    }

    console.log(`\nFound JVS Tratamentos Tenant: ID = ${jvsTrat.id}`);

    // 2. Realized entries for JVS Tratamentos in 2026
    const entries = await prisma.realizedEntry.findMany({
        where: {
            tenantId: jvsTrat.id,
            year: 2026
        },
        include: {
            category: true,
            costCenter: true
        }
    });

    console.log(`\nFound ${entries.length} realized entries for JVS Tratamentos in 2026.`);
    if (entries.length > 0) {
        console.log("Sample entries:");
        entries.slice(0, 10).forEach(e => {
            console.log(`- Month: ${e.month}, Amount: ${e.amount}, Desc: ${e.description}, Cust: ${e.customer}, Category: ${e.category?.code} - ${e.category?.name}, CC: ${e.costCenter?.name}, ViewMode: ${e.viewMode}, ExternalId: ${e.externalId}`);
        });

        // Let's summarize by month and viewMode
        const summary = {};
        entries.forEach(e => {
            const key = `Month ${e.month} | ${e.viewMode}`;
            summary[key] = (summary[key] || 0) + e.amount;
        });
        console.log("\nSummary by Month and ViewMode:", summary);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
