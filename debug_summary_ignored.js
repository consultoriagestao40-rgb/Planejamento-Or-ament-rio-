const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true } });
    
    const tenantToPrimaryMap = new Map();
    const seenKeys = new Set();
    const deduplicatedTenantsMap = new Map();

    tenants.forEach((t) => {
        const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;

        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicatedTenantsMap.set(key, t);
        }
        const primary = deduplicatedTenantsMap.get(key);
        tenantToPrimaryMap.set(t.id, primary.id);
    });

    console.log("--- TENANT MAPPING ---");
    tenants.forEach(t => {
        const pId = tenantToPrimaryMap.get(t.id);
        console.log(`${t.id} (${t.name}) -> Primary: ${pId} ${pId === t.id ? '(PRIMARY)' : '(VARIANT)'}`);
    });

    const entries = await prisma.realizedEntry.findMany({
        select: { tenantId: true, amount: true, description: true }
    });

    console.log("\n--- REALIZED ENTRIES CHECK ---");
    let ignoredCount = 0;
    let ignoredAmount = 0;
    
    entries.forEach(e => {
        const pId = tenantToPrimaryMap.get(e.tenantId);
        if (e.tenantId !== pId) {
            ignoredCount++;
            ignoredAmount += e.amount;
            console.log(`❌ IGNORED: Tenant ${e.tenantId}, Amount ${e.amount}, Desc: ${e.description}`);
        }
    });

    console.log(`\nSummary: ${ignoredCount} entries ignored, total amount: ${ignoredAmount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
