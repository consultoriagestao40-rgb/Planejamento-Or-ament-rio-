const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
  console.log('--- AUDITORIA DE PARIDADE (8.3M) ---');
  
  // 1. Total bruto
  const total = await prisma.budgetEntry.aggregate({
    _sum: { amount: true }
  });
  console.log('Total Bruto no Banco:', total._sum.amount);

  // 2. Maiores órfãos
  const orphans = await prisma.budgetEntry.findMany({
    where: { OR: [{ tenantId: null }, { tenantId: '' }] },
    orderBy: { amount: 'desc' },
    take: 10,
    include: { category: true }
  });

  console.log('\n--- AMOSTRA DE ÓRFÃOS (Top 10) ---');
  orphans.forEach(o => {
    console.log(`Categoria: "${o.category?.name}" | Valor: ${o.amount} | ID: ${o.tenantId || 'ORFÃO'}`);
  });

  await prisma.$disconnect();
}

audit();
