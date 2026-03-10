import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log('--- TENANTS ---');
  tenants.forEach(t => console.log(`${t.name}: ${t.id}`));

  const realized = await prisma.realizedEntry.findMany({
    where: { month: 0, year: 2026 },
    include: { category: true }
  });

  const summary: Record<string, Record<string, number>> = {};
  realized.forEach(r => {
    const tName = tenants.find(t => t.id === r.tenantId)?.name || 'Unknown';
    if (!summary[tName]) summary[tName] = {};
    const catName = r.category.name;
    const view = r.viewMode;
    const key = `${catName} (${view})`;
    summary[tName][key] = (summary[tName][key] || 0) + r.amount;
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
