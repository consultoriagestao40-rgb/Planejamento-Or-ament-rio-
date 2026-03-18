import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';
const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  const year = 2026;
  const month = 1;

  console.log(`Checking Budget for Jan ${year}...`);
  const budgets = await prisma.budgetEntry.findMany({
    where: { year, month },
    include: { category: true }
  });

  const totalBudget = budgets.reduce((acc, b) => acc + b.amount, 0);
  console.log(`Total Budget: ${totalBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  // Filter for Revenue (starts with 01)
  const revenueBudgets = budgets.filter(b => b.category.name.startsWith('01'));
  const totalRevenueBudget = revenueBudgets.reduce((acc, b) => acc + b.amount, 0);
  console.log(`Revenue Budget (01): ${totalRevenueBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  console.log('\nChecking Realized for Jan ${year} (Competencia)...');
  const realized = await prisma.realizedEntry.findMany({
    where: { year, month, viewMode: 'competencia' },
    include: { category: true }
  });

  const totalRealized = realized.reduce((acc, r) => acc + r.amount, 0);
  console.log(`Total Realized: ${totalRealized.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  const revenueRealized = realized.filter(r => r.category.name.startsWith('01'));
  const totalRevenueRealized = revenueRealized.reduce((acc, r) => acc + r.amount, 0);
  console.log(`Revenue Realized (01): ${totalRevenueRealized.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  
  if (Math.abs(totalRevenueRealized - 165527.25) < 1) {
    console.log('\nSUCCESS: Database Realized matches User DRE Gerencial (165.527,25)');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
