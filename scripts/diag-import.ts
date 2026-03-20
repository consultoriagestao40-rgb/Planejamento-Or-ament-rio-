import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("=== ÚLTIMOS REGISTROS NO REALIZADO (Últimas 24h) ===");
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  const latest = await prisma.realizedEntry.findMany({
    where: {
      createdAt: { gte: yesterday }
    },
    take: 50,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      description: true,
      amount: true,
      month: true,
      year: true,
      viewMode: true,
      tenantId: true,
      createdAt: true,
      category: { select: { name: true } },
      costCenter: { select: { name: true } }
    }
  });
  
  if (latest.length === 0) {
    console.log("Nenhum registro encontrado nas últimas 24h.");
  } else {
    latest.forEach((r: any) => {
      console.log(`[${r.createdAt.toISOString()}] | ${r.tenantId} | Mês: ${r.month} | ${r.amount} | ${r.category?.name} | ${r.costCenter?.name || 'GERAL'} | ${r.description}`);
    });
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
