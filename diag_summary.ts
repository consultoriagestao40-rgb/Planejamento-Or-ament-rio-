import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const currentYear = 2025;
  console.log(`--- DIAGNÓSTICO SUMÁRIO (${currentYear}) ---`);

  // 1. Encontrar CC da Galeria
  const ccs = await prisma.costCenter.findMany({
    where: { name: { contains: 'Galeria', mode: 'insensitive' } }
  });

  if (ccs.length === 0) {
    console.log("CC Galeria não encontrado.");
    return;
  }

  for (const cc of ccs) {
    console.log(`\nCC: ${cc.name} (ID: ${cc.id}, Tenant: ${cc.tenantId})`);

    // 2. Buscar lançamentos
    const budgets = await prisma.budgetEntry.findMany({
      where: { costCenterId: cc.id, year: currentYear }
    });

    console.log(`Lançamentos de Orçamento: ${budgets.length}`);
    let total = 0;
    budgets.forEach(b => {
        total += b.amount;
        console.log(`  - Cat: ${b.categoryId}, Month: ${b.month}, Amt: ${b.amount}, TenantInEntry: ${b.tenantId}`);
    });
    console.log(`Total Bruto: ${total}`);

    // 3. Simular lógica do Sumário
    const tenants = await prisma.tenant.findMany();
    const categories = await prisma.category.findMany();
    const categoryTypeMap = new Map(categories.map(c => {
        const isRevenue = c.type === 'REVENUE' || c.name.startsWith('01') || c.name.startsWith('1.');
        return [c.id, isRevenue ? 'REVENUE' : 'EXPENSE'];
    }));

    let summaryRevenue = 0;
    let summaryExpense = 0;

    budgets.forEach(entry => {
        // A lógica do sumário usa entry.tenantId
        const type = categoryTypeMap.get(entry.categoryId);
        if (type === 'REVENUE') {
            summaryRevenue += entry.amount;
        } else {
            summaryExpense += entry.amount;
        }
    });

    console.log(`Resultado Simulação Sumário:`);
    console.log(`  - Revenue: ${summaryRevenue}`);
    console.log(`  - Expense: ${summaryExpense}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
