import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';
const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  const year = 2026;
  const month = 1;

  console.log(`Auditing Jan ${year} for discrepancies...`);

  const entries = await prisma.realizedEntry.findMany({
    where: { year, month, viewMode: 'competencia' },
    include: { category: true }
  });

  console.log(`Found ${entries.length} entries in DB.`);
  const total = entries.reduce((acc, e) => acc + e.amount, 0);
  console.log(`Total Realized in DB: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  // Log categories found
  const catSummary = new Map<string, number>();
  entries.forEach(e => {
    catSummary.set(e.category.name, (catSummary.get(e.category.name) || 0) + e.amount);
  });

  console.log('\nCategories in DB:');
  Array.from(catSummary.entries()).sort((a,b) => b[1] - a[1]).forEach(([name, val]) => {
    console.log(`${name}: ${val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  });

  // Check for the user's specific items
  const descriptions = entries.map(e => e.description || '');
  const targetVendas = [643, 646, 644, 648, 640];
  console.log('\nChecking for specific Vendas:');
  targetVendas.forEach(v => {
    const found = descriptions.some(d => d.includes(String(v)));
    console.log(`Venda ${v}: ${found ? 'FOUND' : 'MISSING'}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
