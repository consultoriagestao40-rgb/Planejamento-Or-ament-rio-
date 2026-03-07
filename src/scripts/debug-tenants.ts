
import { prisma } from '../lib/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log(`Found ${tenants.length} tenants:`);
  for (const t of tenants) {
    const ccCount = await prisma.costCenter.count({ where: { tenantId: t.id } });
    const inactiveCount = await prisma.costCenter.count({ 
      where: { 
        tenantId: t.id,
        OR: [
          { name: { contains: '[INATIVO]' } },
          { name: { contains: 'ENCERRADO', mode: 'insensitive' } }
        ]
      }
    });
    console.log(`- ${t.name}: ${ccCount} CCs total, ${inactiveCount} inactive/closed.`);
    
    // List some active ones to see what they look like
    const activeSample = await prisma.costCenter.findMany({
      where: {
        tenantId: t.id,
        NOT: {
          OR: [
            { name: { contains: '[INATIVO]' } },
            { name: { contains: 'ENCERRADO', mode: 'insensitive' } }
          ]
        }
      },
      take: 5
    });
    console.log(`  Sample active CCs: ${activeSample.map(c => c.name).join(', ')}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
