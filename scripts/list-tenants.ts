
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

const db = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  console.log('--- TENANTS: SPOT ---');
  const tenants = await db.tenant.findMany({
    where: { name: { contains: 'SPOT', mode: 'insensitive' } }
  });
  
  tenants.forEach(t => {
    console.log(`- ID: ${t.id} | Name: ${t.name} | CNPJ: ${t.cnpj}`);
  });
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
