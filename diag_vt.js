const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany({
    where: {
      description: {
         contains: 'VT'
      }
    },
    include: {
      tenant: true
    }
  });
  
  console.log(`Found ${txs.length} potential TXs`);
  for (const t of txs) {
      if (t.description.includes('Rebou')) {
         console.log(`\nID: ${t.id}`);
         console.log(`Date: ${t.date}`);
         console.log(`Desc: ${t.description}`);
         console.log(`Value: ${t.value}`);
         if (t.dataJson) {
           const d = JSON.parse(t.dataJson);
           if (d.costCenters) {
             console.log("Cost Centers in JSON:", JSON.stringify(d.costCenters, null, 2));
           }
         }
      }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
