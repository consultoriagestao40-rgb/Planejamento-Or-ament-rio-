import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- BUSCANDO CATEGORIAS DA JVS FACILITIES ---');
  
  // Buscar o tenant da JVS
  const tenant = await prisma.tenant.findFirst({
    where: {
      name: { contains: 'JVS', mode: 'insensitive' }
    }
  });

  if (!tenant) {
    console.log('JVS Tenant não encontrado');
    return;
  }

  console.log(`Tenant ID: ${tenant.id}`);

  // Buscar todas as categorias desse tenant
  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, type: true }
  });

  console.log(`Total categorias: ${categories.length}`);

  const dasCats = categories.filter(c => c.name.toLowerCase().includes('simples nacional') || c.name.toLowerCase().includes('das'));
  const vendaCats = categories.filter(c => c.name.toLowerCase().includes('venda'));

  console.log('--- DAS CATEGORIES ---');
  console.log(JSON.stringify(dasCats, null, 2));

  console.log('--- VENDA CATEGORIES ---');
  console.log(JSON.stringify(vendaCats, null, 2));

}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
