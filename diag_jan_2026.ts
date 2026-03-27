import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function diagnose() {
  console.log('--- DIAGNÓSTICO JANEIRO 2026 ---');
  const year = 2026, month = 1;
  const entries = await prisma.budgetEntry.findMany({ where: { year, month }, include: { category: true } });
  
  const companySums: Record<string, number> = {};
  const catSums: Record<string, number> = {};
  const duplicates: Record<string, string[]> = {};

  for (const e of entries) {
    const raw = (e.category.name.match(/^([\d.]+)/) || [])[1] || '';
    if (raw.startsWith('1') || raw.startsWith('01')) {
        const cKey = e.tenantId || 'NO-TENANT';
        companySums[cKey] = (companySums[cKey] || 0) + e.amount;
        catSums[e.category.name] = (catSums[e.category.name] || 0) + e.amount;
    }
    const dupKey = `${e.category.name}|${e.tenantId}`;
    if (!duplicates[dupKey]) duplicates[dupKey] = [];
    duplicates[dupKey].push(e.id);
  }

  console.log('--- SOMA POR EMPRESA (RECEITA) ---');
  console.table(companySums);

  console.log('--- SOMA POR CATEGORIA (RECEITA) ---');
  console.table(catSums);

  console.log('--- DUPLICATAS ENCONTRADAS ---');
  for (const k in duplicates) {
    if (duplicates[k].length > 1) {
       console.log(`[DUPLICATA] ${k}: ${duplicates[k].length} registros.`);
    }
  }

  console.log('--- FIM DO DIAGNÓSTICO ---');
}

diagnose().catch(console.error).finally(() => prisma.$disconnect());
