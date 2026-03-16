
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = "postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function audit() {
  try {
    console.log("--- AUDIT: CLEA Tech Pro (Jan 2026) ---");
    
    const clea = await prisma.tenant.findFirst({
        where: { name: { contains: 'Clea', mode: 'insensitive' } }
    });

    if (!clea) {
        console.log("Clea not found");
        return;
    }

    console.log(`Auditing Tenant: ${clea.name} (${clea.id})`);

    const entries = await prisma.realizedEntry.findMany({
      where: {
        tenantId: clea.id,
        month: 0, // Jan is 0
        year: 2026,
        viewMode: 'caixa'
      },
      include: {
        category: true,
        costCenter: true
      }
    });

    console.log(`Total entries found: ${entries.length}`);
    
    const revenueEntries = entries.filter(e => e.category.entradaDre === '01. RECEITA BRUTA');
    const totalRevenue = revenueEntries.reduce((acc, curr) => acc + curr.amount, 0);

    console.log(`\n--- 01. RECEITA BRUTA (Jan 2026) ---`);
    console.log(`Calculated Total: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    const byCategory: Record<string, number> = {};
    revenueEntries.forEach(e => {
        const name = e.category.name;
        byCategory[name] = (byCategory[name] || 0) + e.amount;
    });

    console.log("\nBreakdown by Category:");
    Object.entries(byCategory).sort((a,b) => b[1] - a[1]).forEach(([name, val]) => {
        console.log(`- ${name}: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    });

    // List top transactions if we had transaction IDs, but we only have realized entries.
    // Let's see if there are other entries that are NOT classified as revenue but look like it
    const otherEntries = entries.filter(e => e.category.entradaDre !== '01. RECEITA BRUTA');
    console.log("\nOther entries in Jan 2026 (Potential missing revenue?):");
    otherEntries.forEach(e => {
        console.log(`- [${e.category.entradaDre || 'NULL'}] ${e.category.name}: R$ ${e.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    });

  } catch (error) {
    console.error("Audit failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

audit();
