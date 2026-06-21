const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany();
    console.log("=== TENANTS ===");
    console.log(tenants.map(t => ({ id: t.id, name: t.name, cnpj: t.cnpj })));

    for (const t of tenants) {
        const bankAccounts = await prisma.bankAccount.findMany({ where: { tenantId: t.id } });
        const expectedRec = await prisma.realizedEntry.count({
            where: { tenantId: t.id, viewMode: 'previsto_receber' }
        });
        const expectedPay = await prisma.realizedEntry.count({
            where: { tenantId: t.id, viewMode: 'previsto_pagar' }
        });
        console.log(`\nTenant: ${t.name}`);
        console.log(`Bank Accounts:`, bankAccounts);
        console.log(`Expected Receivables:`, expectedRec);
        console.log(`Expected Payables:`, expectedPay);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
