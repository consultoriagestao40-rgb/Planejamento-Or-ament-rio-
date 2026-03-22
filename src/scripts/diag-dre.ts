import { PrismaClient } from '@prisma/client';
const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';
const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  const spotTenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // From previous logs
  const month = '2026-01-01T00:00:00.000Z'; // January 2026
  
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

  const summary: Record<string, { name: string, total: number, ids: string[] }> = {};
  let total = 0;

  for (const t of transactions) {
    const catCode = t.category?.name.split(' - ')[0] || t.category?.name || 'Unknown';
    if (!summary[catCode]) {
      summary[catCode] = { name: t.category?.name || 'Unknown', total: 0, ids: [] };
    }
    summary[catCode].total += Number(t.amount);
    summary[catCode].ids.push(t.id);
    total += Number(t.amount);
  }

  // Sort by category code
  const sorted = Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0]));
  
  console.log("=== RESUMO DRE NO BANCO DE DADOS (JAN 2026, SPOT) ===");
  for (const [code, data] of sorted) {
    console.log(`${code.padEnd(10)} | ${data.name.padEnd(40)} | R$ ${data.total.toFixed(2).padStart(12)} | (${data.ids.length} registros)`);
  }
  console.log("--------------------------------------------------");
  console.log(`TOTAL GERAL: R$ ${total.toFixed(2)}`);

  // Extra details for '01.1.1' and '03.1.1'
  console.log("\n=== DETALHES DE RECEITA (01.1.1) ===");
  const rev = transactions.filter(t => t.category?.name.includes('01.1.1'));
  rev.forEach(t => console.log(` - [${t.description}] R$ ${t.amount} (CC: ${t.costCenter?.name || 'Geral'})`));
  
  console.log(`Sum of Rev: ${rev.reduce((acc, t) => acc + Number(t.amount), 0)}`);

}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
