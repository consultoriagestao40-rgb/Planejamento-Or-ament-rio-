import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("=== DIAGNÓSTICO DE VALORES (Últimas 24h) ===");
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  const entries = await prisma.realizedEntry.findMany({
    where: {
      createdAt: { gte: yesterday }
    },
    include: {
        category: true
    }
  });
  
  const summary: Record<string, number> = {};
  entries.forEach((e: any) => {
      const catName = e.category?.name || "SEM CATEGORIA";
      summary[catName] = (summary[catName] || 0) + e.amount;
  });

  console.log("Resumo por Categoria:");
  Object.entries(summary).forEach(([name, total]) => {
      console.log(`${name}: ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  });

  if (entries.length === 0) {
    console.log("Nenhum registro encontrado nas últimas 24h.");
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
