import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const year = 2026;
    const month = 1;
    const viewMode = 'competencia';

    console.log(`\n🔍 BUSCANDO RECEITA - JANEIRO ${year} (${viewMode.toUpperCase()})`);

    // 1. Get all realized entries for the period
    const entries = await prisma.realizedEntry.findMany({
      where: {
        year,
        month,
        viewMode
      },
      include: {
        category: true,
        tenant: true,
        costCenter: true
      }
    });

    console.log(`📊 Total de registros encontrados: ${entries.length}`);

    // Groups
    let totalRevenue = 0;
    const byCategory: Record<string, number> = {};
    const byTenant: Record<string, number> = {};

    entries.forEach(e => {
      const catName = e.category.name || 'Sem Categoria';
      const tenantName = e.tenant.name || 'Sem Empresa';
      
      // Revenue logic from sync/route.ts: normalizedName.startsWith('01')
      const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const isRevenue = normalizedName.startsWith('01');

      if (isRevenue) {
        totalRevenue += e.amount;
        byCategory[catName] = (byCategory[catName] || 0) + e.amount;
        byTenant[tenantName] = (byTenant[tenantName] || 0) + e.amount;
      }
    });

    console.log(`\n💰 RECEITA TOTAL CALCULADA: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    console.log('\n📂 POR CATEGORIA:');
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, val]) => {
        console.log(`  - ${cat}: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      });

    console.log('\n🏢 POR EMPRESA:');
    Object.entries(byTenant)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tenant, val]) => {
        console.log(`  - ${tenant}: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      });

  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
