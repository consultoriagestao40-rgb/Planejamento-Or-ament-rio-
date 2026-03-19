
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debug() {
  const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT
  const year = 2026;
  const month = 1;

  console.log(`Checking DB for Jan 2026, SPOT...`);
  const entries = await prisma.realizedEntry.findMany({
    where: { tenantId, year, month },
    include: { category: true }
  });

  console.log(`Total entries in DB for Jan 2026: ${entries.length}`);
  
  const groups = entries.reduce((acc: any, e) => {
    const parent = e.category.name.split('.')[0];
    acc[parent] = (acc[parent] || 0) + e.amount;
    return acc;
  }, {});

  console.log('Breakdown by Parent Category:', groups);
  
  if (entries.length > 0) {
    console.log('Sample entries:');
    entries.slice(0, 5).forEach(e => {
        console.log(`- ${e.description}: ${e.amount} (Cat: ${e.category.name})`);
    });
  }
}

debug().catch(console.error);
