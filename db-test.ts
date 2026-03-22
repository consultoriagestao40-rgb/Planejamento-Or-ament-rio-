import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const categories = await prisma.category.findMany({ take: 5 });
    console.log('Categories found:', categories.length);
    console.log('Sample category:', categories[0]?.name);
    
    const entries = await prisma.realizedEntry.findMany({ 
      where: { month: 1, year: 2026 },
      take: 5 
    });
    console.log('Jan 2026 entries found:', entries.length);
    
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
