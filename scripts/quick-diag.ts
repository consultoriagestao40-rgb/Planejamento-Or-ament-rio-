import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.category.findMany({ take: 20 });
  console.log('--- CATEGORIAS NO BANCO ---');
  categories.forEach(c => {
    console.log(`ID: ${c.id} | Nome: "${c.name}" | TenantId: ${c.tenantId}`);
  });
  
  const budgetCount = await prisma.budgetEntry.count({ where: { year: 2026 } });
  console.log(`\nTotal de Orçamentos (2026): ${budgetCount}`);
  
  const realizedCount = await prisma.realizedEntry.count({ where: { year: 2026 } });
  console.log(`Total de Realizados (2026): ${realizedCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
