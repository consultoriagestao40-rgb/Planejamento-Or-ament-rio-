import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';
const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  const spotTenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26';
  const transactions = await prisma.realizedEntry.findMany({
    where: {
      tenantId: spotTenantId,
      month: 1,
      year: 2026
    },
    include: {
      category: true,
      costCenter: true
    }
  });

  const summary: Record<string, { total: number, names: Set<string> }> = {};
  
  for (const t of transactions) {
    const code = t.category.name.substring(0, 6); // Grab like "01.1.1" or "03.1.1"
    if (!summary[code]) summary[code] = { total: 0, names: new Set() };
    summary[code].total += t.amount;
    summary[code].names.add(t.category.name);
  }

  const sorted = Object.entries(summary).sort((a,b) => a[0].localeCompare(b[0]));
  console.log("=== DB DRE TOTALS ===");
  for (const [c, d] of sorted) {
    console.log(`${c.padEnd(8)}: R$ ${d.total.toFixed(2).padStart(12)} | [${Array.from(d.names).join(', ')}]`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
