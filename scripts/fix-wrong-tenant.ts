import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    console.log("Tenants:", JSON.stringify(tenants, null, 2));
    
    // Find all budget entries with amount > 0, check if tenantId matches the category's tenant
    const budgets = await prisma.budgetEntry.findMany({
        where: { amount: { gt: 0 } },
        include: { category: { select: { tenantId: true, name: true } } }
    });
    
    const mismatched = budgets.filter(b => b.tenantId !== b.category.tenantId);
    console.log(`\nMismatched entries (tenantId != category.tenantId): ${mismatched.length}`);
    
    mismatched.forEach(b => {
        const entryTenant = tenants.find(t => t.id === b.tenantId)?.name;
        const catTenant = tenants.find(t => t.id === b.category.tenantId)?.name;
        console.log(`  ID: ${b.id} | amount: ${b.amount} | entry tenant: ${entryTenant} | cat tenant: ${catTenant} | cat: ${b.category.name}`);
    });
}
check().finally(() => prisma.$disconnect());
