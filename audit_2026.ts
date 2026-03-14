import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetYear = 2026;
  console.log(`\n=== AUDITORIA RECEITA BRUTA ${targetYear} ===\n`);

  const tenants = await prisma.tenant.findMany();
  const categories = await prisma.category.findMany();

  // Mapear categorias de Receita Bruta
  const revenueCategories = categories.filter((c: any) => {
    const name = (c.name || '').toLowerCase();
    return c.type === 'REVENUE' || 
           c.name?.startsWith('01') || 
           c.name?.startsWith('1.') || 
           name.includes('receita') || 
           name.includes('venda');
  });

  const revCatIds = revenueCategories.map((c: any) => c.id);
  console.log(`Categorias Identificadas como Receita: ${revenueCategories.length}`);

  for (const t of tenants) {
    const realized = await prisma.realizedEntry.findMany({
      where: {
        tenantId: t.id,
        year: targetYear,
        categoryId: { in: revCatIds }
      }
    });

    const total = realized.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);
    
    console.log(`Empresa: ${t.name}`);
    console.log(`ID: ${t.id}`);
    console.log(`Total Receita Bruta (Realizado): R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    if (realized.length > 0) {
        console.log(`Detalhes por Categoria:`);
        const byCat = realized.reduce((acc: any, curr: any) => {
            acc[curr.categoryId] = (acc[curr.categoryId] || 0) + (curr.amount || 0);
            return acc;
        }, {} as Record<string, number>);
        
        Object.entries(byCat).forEach(([catId, amt]: [string, any]) => {
            const cat = categories.find((c: any) => c.id === catId);
            console.log(`  - ${cat?.name || catId}: R$ ${amt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        });
    }
    console.log('-----------------------------------');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
