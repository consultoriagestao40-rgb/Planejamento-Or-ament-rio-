import { prisma } from './src/lib/prisma';

async function listCategories() {
  const categories = await prisma.category.findMany({
    where: {
      OR: [
        { id: { contains: ':02.01' } },
        { name: { contains: '02.01' } }
      ]
    },
    take: 20
  });
  console.log(JSON.stringify(categories, null, 2));
}

listCategories().catch(console.error);
