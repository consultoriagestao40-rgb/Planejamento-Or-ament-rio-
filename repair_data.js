const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repair() {
  console.log('--- REPARO GLOBAL DE ORÇAMENTOS 2026 (v66.69) ---');
  
  // 1. Limpeza de lixo
  const junk = await prisma.budgetEntry.deleteMany({
    where: { OR: [{ tenantId: 'ALL' }, { tenantId: 'undefined' }, { tenantId: null }] }
  });
  console.log('Lixo removido:', junk.count);

  // 2. Buscar todas as receitas de 2026 para recalcular impostos
  const entries = await prisma.budgetEntry.findMany({ where: { year: 2026 } });
  
  // Agrupar por Empresa + Centro de Custo + Mes
  const revenueMap = {};
  const dasCategoryMap = {}; // Para achar o ID do DAS de cada empresa

  // Mapeamento de categorias DAS por tenant
  const allCats = await prisma.category.findMany();
  allCats.forEach(c => {
    const raw = (c.name.match(/^([\d.]+)/) || [])[1] || '';
    if (raw.startsWith('2.1.1') || raw.startsWith('02.1.1')) {
      dasCategoryMap[c.tenantId] = c.id;
    }
  });

  for (const e of entries) {
    const raw = (e.categoryId.match(/^([\d.]+)/) || [])[1] || ''; // Caso o ID seja o nome/codigo
    // Infelizmente o ID é gerado pelo banco, precisamos buscar o nome da categoria se o ID nao for codigo
    // Mas no seu banco, o budgetEntry.categoryId é o UUID da categoria.
  }

  // Abordagem simplificada: Buscar todas as categorias que são RECEITA
  const revCats = allCats.filter(c => {
    const r = (c.name.match(/^([\d.]+)/) || [])[1] || '';
    return r.startsWith('1') || r.startsWith('01');
  }).map(c => c.id);

  const txRate = 0.10; // 10%

  for (const e of entries) {
    if (revCats.includes(e.categoryId)) {
      const key = `${e.tenantId}|${e.costCenterId}|${e.month}`;
      revenueMap[key] = (revenueMap[key] || 0) + e.amount;
    }
  }

  console.log('Recalculando DAS para', Object.keys(revenueMap).length, 'combinantes (Empresa/CC/Mes)');

  for (const key in revenueMap) {
    const [tId, ccId, month] = key.split('|');
    const totalRev = revenueMap[key];
    const dasId = dasCategoryMap[tId];

    if (dasId && tId && tId !== 'undefined') {
      const dasAmount = totalRev * txRate;
      
      // Deletar o DAS antigo deste mes/cc/empresa e criar o novo calibrado
      await prisma.budgetEntry.deleteMany({
        where: { categoryId: dasId, tenantId: tId, costCenterId: ccId === 'null' ? null : ccId, month: parseInt(month), year: 2026 }
      });

      if (dasAmount > 0) {
        await prisma.budgetEntry.create({
          data: {
            categoryId: dasId,
            tenantId: tId,
            costCenterId: ccId === 'null' ? null : ccId,
            month: parseInt(month),
            year: 2026,
            amount: dasAmount
          }
        });
      }
    }
  }

  console.log('--- REPARO CONCLUÍDO ---');
}

repair().catch(console.error).finally(() => prisma.$disconnect());
