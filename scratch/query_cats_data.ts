import { prisma } from '../src/lib/prisma';

async function main() {
  console.log("=== DB QUERY START ===");
  
  // Find all categories with 'diária' or 'diaria' in name, or code '03.4' or similar
  const categories = await prisma.category.findMany({
    where: {
      OR: [
        { name: { contains: 'Diária', mode: 'insensitive' } },
        { name: { contains: 'Diaria', mode: 'insensitive' } },
        { name: { contains: '03.4', mode: 'insensitive' } }
      ]
    },
    include: {
      tenant: { select: { name: true } }
    }
  });

  console.log(`Encontradas ${categories.length} categorias:`);
  for (const cat of categories) {
    console.log(`Category: ID=${cat.id} | Name=${cat.name} | Tenant=${cat.tenant.name} | TenantID=${cat.tenantId} | ParentID=${cat.parentId}`);
    
    // Check realized entries for this category in Jan 2026
    const entries = await prisma.realizedEntry.findMany({
      where: {
        categoryId: cat.id,
        year: 2026,
        month: 1
      }
    });
    
    const sumCompetencia = entries.filter(e => e.viewMode === 'competencia').reduce((acc, e) => acc + e.amount, 0);
    const sumCaixa = entries.filter(e => e.viewMode === 'caixa').reduce((acc, e) => acc + e.amount, 0);
    
    console.log(`  Jan 2026 Realized entries count: ${entries.length}`);
    console.log(`  Sum (competência): R$ ${sumCompetencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`  Sum (caixa): R$ ${sumCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
