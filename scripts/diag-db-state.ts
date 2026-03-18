import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("=== DB DIAGNOSTIC v0.9.11 ===");
    
    const tenants = await prisma.tenant.findMany({
        select: { id: true, name: true, cnpj: true }
    });
    
    console.log(`Total tenants: ${tenants.length}`);
    
    const stats2026 = await prisma.realizedEntry.groupBy({
        by: ['tenantId', 'viewMode'],
        _count: true,
        _sum: { amount: true },
        where: { year: 2026 }
    });
    
    console.log("\n--- Realized Stats 2026 ---");
    stats2026.forEach(s => {
        const t = tenants.find(ten => ten.id === s.tenantId);
        console.log(`Tenant: ${t?.name || s.tenantId} | Mode: ${s.viewMode} | Count: ${s._count} | Sum: ${s._sum.amount}`);
    });

    const sample = await prisma.realizedEntry.findMany({
        where: { year: 2026, month: 1 },
        take: 10,
        include: { category: { select: { name: true } } }
    });
    
    console.log("\n--- Sample Entries Jan 2026 ---");
    sample.forEach(e => {
        console.log(`[${e.category.name}] Amt: ${e.amount} | Tenant: ${tenants.find(t => t.id === e.tenantId)?.name}`);
    });

    // Check if categories are missing names or mapped weirdly
    const orphans = await prisma.realizedEntry.count({
        where: { category: { name: "" } }
    });
    console.log(`\nOrphan entries (no cat name): ${orphans}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
