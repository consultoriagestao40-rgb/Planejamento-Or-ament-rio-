import { prisma } from './src/lib/prisma';

async function audit() {
  const ccs = await prisma.costCenter.findMany();
  const summary: Record<string, string[]> = {};

  ccs.forEach(cc => {
    const cleanName = (cc.name || '')
      .replace(/^\[INATIVO\]\s*/i, '')
      .replace(/^ENCERRADO\s*/i, '')
      .trim();
    const key = `${cc.tenantId}:${cleanName}`;
    if (!summary[key]) summary[key] = [];
    summary[key].push(`${cc.id} (${cc.name})`);
  });

  const duplicates = Object.entries(summary).filter(([_, ids]) => ids.length > 1);
  console.log('Duplicate Cost Centers (Normalized):', JSON.stringify(duplicates, null, 2));
}

audit();
