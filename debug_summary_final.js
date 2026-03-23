const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    const year = 2026;
    console.log(`--- DEBUGGING BUDGET ENTRIES FOR ${year} ---`);
    
    // 1. Get all budget entries for 2026
    const entries = await prisma.budgetEntry.findMany({
        where: { year },
        select: { id: true, amount: true, tenantId: true, costCenterId: true, categoryId: true }
    });
    console.log(`Found ${entries.length} entries.`);
    
    if (entries.length === 0) return;

    // 2. Get all cost centers
    const ccs = await prisma.costCenter.findMany();
    const ccMap = new Map(ccs.map(c => [c.id, c]));
    console.log(`Found ${ccs.length} cost centers in total.`);

    // 3. Analyze matches
    let matches = 0;
    let nullCCs = 0;
    let missingCCs = new Set();
    
    entries.forEach(e => {
        if (!e.costCenterId || e.costCenterId === 'DEFAULT') {
            nullCCs++;
        } else if (ccMap.has(e.costCenterId)) {
            matches++;
        } else {
            missingCCs.add(e.costCenterId);
        }
    });

    console.log(`Matches found: ${matches}`);
    console.log(`Null/Geral CCs: ${nullCCs}`);
    console.log(`Missing CC IDs in CostCenter table: ${missingCCs.size}`);
    if (missingCCs.size > 0) {
        console.log('Sample missing CC IDs:', Array.from(missingCCs).slice(0, 5));
    }

    // 4. Check Tenants
    const tenants = await prisma.tenant.findMany();
    const tenantMap = new Map(tenants.map(t => [t.id, t]));
    let missingTenants = new Set();
    entries.forEach(e => {
        if (!tenantMap.has(e.tenantId)) missingTenants.add(e.tenantId);
    });
    console.log(`Missing Tenant IDs: ${missingTenants.size}`);

    // 5. Special check for SPOT
    const spotTenants = tenants.filter(t => t.name.includes('SPOT'));
    console.log('SPOT Tenants:', spotTenants.map(t => ({ id: t.id, name: t.name })));
    
    const spotEntries = entries.filter(e => spotTenants.some(t => t.id === e.tenantId));
    console.log(`Total entries for SPOT tenants: ${spotEntries.length}`);
    if (spotEntries.length > 0) {
        console.log('Sample SPOT entry:', spotEntries[0]);
        const ccId = spotEntries[0].costCenterId;
        const ccExists = ccMap.get(ccId);
        console.log(`CC ${ccId} exists? ${!!ccExists} (${ccExists?.name})`);
    }
}

debug().catch(console.error).finally(() => prisma.$disconnect());
