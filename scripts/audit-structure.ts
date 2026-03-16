import { prisma } from '../src/lib/prisma';

async function run() {
  const spot = await prisma.tenant.findFirst({ 
    where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
  });
  
  if (!spot) {
    console.log('SPOT not found');
    return;
  }

  const cat = await prisma.category.findFirst({ 
    where: { tenantId: spot.id, name: { contains: 'Receitas de Vendas', mode: 'insensitive' } } 
  });
  
  if (!cat) {
    console.log('Cat not found');
    return;
  }

  const children = await prisma.category.findMany({ where: { parentId: cat.id } });
  console.log('--- CATEGORY STRUCTURE ---');
  console.log('Parent:', cat.name, '| ID:', cat.id);
  console.log('Children Count:', children.length);
  children.forEach(c => console.log(` - Child: ${c.name} | ID: ${c.id}`));

  const entries = await prisma.realizedEntry.findMany({ 
    where: { 
        tenantId: spot.id, 
        month: 0, 
        year: 2026, 
        viewMode: 'competencia' 
    }, 
    include: { category: true } 
  });

  console.log('\n--- ENTRIES IN JAN 2026 ---');
  let total = 0;
  entries.forEach(e => {
      total += e.amount;
      console.log(`${e.category.name} (${e.categoryId}): R$ ${e.amount.toLocaleString('pt-BR')}`);
  });
  console.log('GRAND TOTAL (GRID SOURCE): R$ ' + total.toLocaleString('pt-BR'));
}

run().catch(console.error).finally(() => prisma.$disconnect());
