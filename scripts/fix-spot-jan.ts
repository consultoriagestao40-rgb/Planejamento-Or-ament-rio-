
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

const db = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  console.log('--- CLEANUP: SPOT FACILITIES 2026 ---');
  
  const spot = await db.tenant.findFirst({ 
    where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
  });
  
  if (!spot) {
    console.log('SPOT not found');
    return;
  }

  // 1. Delete all current 2026 entries for SPOT to start clean
  const delRes = await db.realizedEntry.deleteMany({
    where: { 
      tenantId: spot.id, 
      year: 2026 
    }
  });

  console.log(`Deleted ${delRes.count} realized entries for SPOT in 2026.`);
  console.log('The database is now clean for a fresh sync.');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
