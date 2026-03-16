
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

const db = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  console.log('--- DIAGNOSTIC: CLEAN TECH JAN 2026 ---');
  
  const tenants = await db.tenant.findMany({ 
    where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
  });
  
  if (tenants.length === 0) {
    console.log('No Clean Tech tenants found');
    return;
  }

  console.log(`Found ${tenants.length} variants of Clean Tech.`);
  
  for (const t of tenants) {
    console.log(`\nInspecting Tenant: ${t.name} (${t.id}) - CNPJ: ${t.cnpj}`);
    
    const entries = await db.realizedEntry.findMany({
      where: { 
        tenantId: t.id, 
        month: 0, 
        year: 2026, 
        viewMode: 'competencia' 
      },
      include: { category: true }
    });

    console.log(`- Total entries (Competência): ${entries.length}`);
    
    const revenueEntries = entries.filter(e => {
        const name = e.category.name || '';
        const level = name.split('.').filter(Boolean).length;
        return (name.startsWith('01') || name.startsWith('1')) && level === 3;
    });

    const sumRevenue = revenueEntries.reduce((s, e) => s + e.amount, 0);
    console.log(`- Calculated Revenue (3-segment): R$ ${sumRevenue.toLocaleString('pt-BR')}`);
    
    if (revenueEntries.length > 0) {
        console.log('  Breakdown:');
        revenueEntries.forEach(e => {
            console.log(`    [${e.category.id}] ${e.category.name}: R$ ${e.amount.toLocaleString('pt-BR')}`);
        });
    }

    const allRevenueEntries = entries.filter(e => {
        const name = e.category.name || '';
        return (name.startsWith('01') || name.startsWith('1'));
    });
    const sumAllRev = allRevenueEntries.reduce((s, e) => s + e.amount, 0);
    console.log(`- Total Revenue (ANY segment): R$ ${sumAllRev.toLocaleString('pt-BR')}`);
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
