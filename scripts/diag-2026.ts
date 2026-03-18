
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';
const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});


async function main() {
  const year = 2026;
  const viewMode = 'competencia';

  console.log(`Checking RealizedEntry for year ${year} and viewMode ${viewMode}...`);

  const entries = await prisma.realizedEntry.findMany({
    where: {
      year,
      viewMode
    },
    include: {
      category: true,
      tenant: true
    }
  });

  console.log(`Found ${entries.length} entries.`);

  if (entries.length > 0) {
    const totalByMonth = new Array(12).fill(0);
    const byCategory = new Map<string, number>();

    entries.forEach(e => {
      totalByMonth[e.month - 1] += e.amount;
      const catName = e.category.name;
      byCategory.set(catName, (byCategory.get(catName) || 0) + e.amount);
    });

    console.log('Totals by Month:');
    totalByMonth.forEach((total, i) => {
      if (total !== 0) {
        console.log(`Month ${i + 1}: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
      }
    });

    console.log('\nTop 10 Categories by Total Amount:');
    const sortedCats = Array.from(byCategory.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    sortedCats.slice(0, 10).forEach(([name, total]) => {
      console.log(`${name}: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    });
    
    // Check specifically for categories starting with '01'
    console.log('\nRevenue Categories (starting with 01):');
    sortedCats.filter(([name]) => name.startsWith('01')).forEach(([name, total]) => {
      console.log(`${name}: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    });
  } else {
    // If no entries for 2026, check 2025 to see if sync works AT ALL
    console.log('\nChecking 2025 as fallback...');
    const count2025 = await prisma.realizedEntry.count({ where: { year: 2025, viewMode } });
    console.log(`Found ${count2025} entries for 2025.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
