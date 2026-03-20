import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("=== DIAGNÓSTICO DE TENANTS ===");
  const tenants = await prisma.tenant.findMany();
  tenants.forEach(t => {
    console.log(`- NAME: ${t.name} | ID: ${t.id} | CNPJ: ${t.cnpj}`);
  });

  const spot = tenants.find(t => t.name.includes('SPOT'));
  if (spot) {
      const records = await prisma.realizedEntry.count({
          where: { tenantId: spot.id, month: 1, year: 2026 }
      });
      console.log(`\nSPOT FACILITIES (${spot.id}) tem ${records} registros em JAN/2026.`);
      
      const sample = await prisma.realizedEntry.findFirst({
           where: { tenantId: spot.id, month: 1, year: 2026 },
           include: { category: true }
      });
      if (sample) {
          console.log(`Amostra: Cat: ${sample.category?.name} | Valor: ${sample.amount} | Source: ${sample.externalId}`);
      }
  }
}

main().catch(console.error);
