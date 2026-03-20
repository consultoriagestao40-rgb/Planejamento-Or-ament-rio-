import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: { contains: 'SPOT', mode: 'insensitive' } }
  });

  if (!tenant) return;

  console.log(`EMPRESA: ${tenant.name} (${tenant.id})`);

  // Pegar categorias da empresa para ver os IDs
  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true }
  });
  console.log("Categorias da Empresa (Banco):");
  categories.slice(0, 5).forEach(c => console.log(` - ${c.id}: ${c.name}`));

  // Pegar registros manuais vs sincronizados de Janeiro 2026
  const entries = await prisma.realizedEntry.findMany({
    where: {
      tenantId: tenant.id,
      month: 1,
      year: 2026,
      viewMode: 'competencia'
    },
    take: 20
  });

  console.log("\nRegistros em JAN 2026 (Competência):");
  entries.forEach(e => {
    console.log(` - [${e.externalId}] CatID: ${e.categoryId} | Valor: ${e.amount}`);
  });
}

main();
