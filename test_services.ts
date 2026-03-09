import { prisma } from './src/lib/prisma';
import { generateBudgetSummaryForTenant } from './src/lib/services';

async function main() {
    console.log("Testing summary generation for JVS Facilities...");
    
    // 1. Get JVS Tenant
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    if (!tenant) return console.log("Tenant not found.");

    // 2. Get Rebouças Cost Center ID
    const cc = await prisma.costCenter.findFirst({
        where: { name: { contains: 'Rebouças' }, tenantId: tenant.id }
    });
    if (!cc) return console.log("Cost center not found.");

    console.log(`Using Tenant: ${tenant.name} | CC: ${cc.name} (${cc.externalId})`);

    // 3. Generate summary directly using services
    const data = await generateBudgetSummaryForTenant(tenant.id, cc.externalId, 2026, 'competencia');
    
    // We want to see category 03.3.1 - Vale Transporte for January (month 0)
    // Actually, I don't know the exact category ID mapping here, so let's log everything for month 0 that has a value.
    const janData: any = {};
    for (const d of data) {
        if (d.realized[0] > 0) {
            janData[d.title] = d.realized[0];
        }
    }
    
    console.log("\nJanuary Realized Data for Guarda Brasil - Rebouças:");
    console.table(janData);
    console.log("If the fix is working, Vale Transporte should be close to ~252.00");
}

main().catch(console.error).finally(() => prisma.$disconnect());
