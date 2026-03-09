const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Let's check RealizedEntry first to see if we can find the 522.18 value
  console.log("Searching RealizedEntry for value ~522.18...");
  const entries = await prisma.realizedEntry.findMany({
    where: {
      amount: {
        gte: 520,
        lte: 525
      }
    },
    include: {
      category: true,
      costCenter: true,
      tenant: true
    }
  });
  
  console.log(`Found ${entries.length} entries matching amount.`);
  for (const e of entries) {
      console.log(`\nEntry ID: ${e.id}`);
      console.log(`Amount: ${e.amount}`);
      console.log(`Date: ${e.date}`);
      console.log(`Desc: ${e.description}`);
      console.log(`Category: ${e.category?.name}`);
      console.log(`Cost Center: ${e.costCenter?.name}`);
      console.log(`Tenant: ${e.tenant?.name}`);
      console.log(`Original Tx ID: ${e.transactionId}`);
  }

  // Now let's try to query transaction by value too, maybe it's 5744.00 (the total)
  console.log("\nSearching Transaction for total rateio ~5744.00...");
  const txs = await prisma.transaction.findMany({
    where: {
      value: {
        gte: 5740,
        lte: 5750
      }
    }
  });

  console.log(`Found ${txs.length} transactions matching total.`);
  for (const t of txs) {
      console.log(`\nTX ID: ${t.id}`);
      console.log(`Desc: ${t.description}`);
      console.log(`Value: ${t.value}`);
      console.log(`Date: ${t.date}`);
      if (t.dataJson) {
           const d = JSON.parse(t.dataJson);
           if (d.costCenters) {
             console.log("Apportionments:");
             d.costCenters.forEach(c => console.log(`  - ${c.nome}: ${c.valor} (${c.percentual}%)`));
           }
      }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
