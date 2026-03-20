import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: { contains: 'SPOT', mode: 'insensitive' } }
  });

  if (!tenant) {
    console.log("Empresa SPOT não encontrada.");
    return;
  }

  console.log(`=== DEBUG DADOS: ${tenant.name} (${tenant.id}) ===`);

  const entries = await prisma.realizedEntry.findMany({
    where: {
      tenantId: tenant.id,
      year: 2026
    },
    orderBy: { month: 'asc' }
  });

  const summary: Record<number, number> = {};
  entries.forEach(e => {
    summary[e.month] = (summary[e.month] || 0) + e.amount;
  });

  console.log("Total por Mês em 2026:");
  for (let i = 1; i <= 12; i++) {
      if (summary[i]) {
          console.log(`Mês ${i}: R$ ${summary[i].toLocaleString('pt-BR')}`);
      }
  }
}

main();
