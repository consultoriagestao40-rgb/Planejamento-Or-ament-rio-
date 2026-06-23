const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const filterTenantId = 'ALL';
    const year = 2026;
    const viewMode = 'competencia';

    // 1. Resolve target tenants
    const allTenants = await prisma.tenant.findMany({ select: { id: true } });
    const targetTenantIds = allTenants.map(t => t.id);

    console.log('Target Tenant IDs:', targetTenantIds);

    // 2. Fetch Raw entries
    const [realizedRaw, budgetRaw] = await Promise.all([
      prisma.realizedEntry.findMany({
        where: {
          tenantId: { in: targetTenantIds },
          year,
          viewMode,
        },
        include: { category: true }
      }),
      prisma.budgetEntry.findMany({
        where: {
          tenantId: { in: targetTenantIds },
          year,
        },
        include: { category: true }
      })
    ]);

    console.log(`Raw realized entries count: ${realizedRaw.length}`);
    console.log(`Raw budget entries count: ${budgetRaw.length}`);

    // Deduplicate realized raw values
    const syncedMonths = new Set();
    realizedRaw.forEach(e => {
      if (e.externalId && e.externalId.startsWith('sync-')) {
        syncedMonths.add(`${e.year}|${e.month}`);
      }
    });
    const realizedEntriesRaw = realizedRaw.filter(e => {
      const key = `${e.year}|${e.month}`;
      if (syncedMonths.has(key)) {
        return e.externalId && e.externalId.startsWith('sync-');
      }
      return true;
    });

    const categories = await prisma.category.findMany({
      where: { tenantId: { in: targetTenantIds } }
    });

    console.log(`Categories count: ${categories.length}`);

    const categoryNameMap = new Map();
    categories.forEach(c => {
      categoryNameMap.set(c.id, c.name);
      if (c.id.includes(':')) {
        const code = c.id.split(':')[1];
        if (!categoryNameMap.has(code)) {
          categoryNameMap.set(code, c.name);
        }
      }
    });

    const getCleanCode = (name) => {
      const match = name.match(/^(\d{1,2}(?:\.\d+)*)/);
      return match ? match[1] : '';
    };

    const isConsolidated = true;

    const realizedEntries = realizedEntriesRaw.filter(e => {
      const catName = categoryNameMap.get(e.categoryId) || '';
      const code = getCleanCode(catName);
      if (code === '06.1.2' || code === '06.2.2') return false;
      if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
      return true;
    });

    const budgetEntries = budgetRaw.filter(e => {
      const catName = categoryNameMap.get(e.categoryId) || '';
      const code = getCleanCode(catName);
      if (code === '06.1.2' || code === '06.2.2') return false;
      if (isConsolidated && (code === '06.1.1' || code === '06.2.1')) return false;
      return true;
    });

    console.log(`Filtered realized entries count: ${realizedEntries.length}`);
    console.log(`Filtered budget entries count: ${budgetEntries.length}`);

    // Let's print out realized entries for category starts with '01'
    const realizedByMonthForRevenue = new Array(12).fill(0);
    const budgetByMonthForRevenue = new Array(12).fill(0);

    realizedEntries.forEach(e => {
      const catName = categoryNameMap.get(e.categoryId) || '';
      const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalizedName.startsWith('01') || catName.startsWith('01') || catName.startsWith('1')) {
        realizedByMonthForRevenue[e.month - 1] += e.amount;
      }
    });

    budgetEntries.forEach(e => {
      const catName = categoryNameMap.get(e.categoryId) || '';
      const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalizedName.startsWith('01') || catName.startsWith('01') || catName.startsWith('1')) {
        budgetByMonthForRevenue[e.month - 1] += e.amount;
      }
    });

    console.log('--- DIRECT CATEGORY SUM (StartsWith 01 / 1) ---');
    for (let m = 0; m < 12; m++) {
      console.log(`Month ${m+1}: Budget = ${budgetByMonthForRevenue[m].toFixed(2)}, Realized = ${realizedByMonthForRevenue[m].toFixed(2)}`);
    }

    // Now let's build the category tree node tree and print out the sum
    const map = new Map();
    const codeMap = new Map();
    const nameMap = new Map();

    categories.forEach((cat) => {
      const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
      const uniqueKey = `${cat.type}|${cleanCode || cat.name.trim()}`;

      if (nameMap.has(uniqueKey)) {
        const existingNode = nameMap.get(uniqueKey);
        if (!existingNode.id.split(',').includes(cat.id)) {
          existingNode.id += ',' + cat.id;
        }
        map.set(cat.id, existingNode);
        return;
      }

      const node = {
        id: cat.id,
        name: cat.name,
        code: cleanCode,
        children: [],
        level: 0,
        isSynthetic: false,
        tenantId: cat.tenantId
      };
      map.set(cat.id, node);
      if (cat.id.includes(':')) {
        map.set(cat.id.split(':')[1], node);
      }
      nameMap.set(uniqueKey, node);
      if (cleanCode) {
        codeMap.set(cleanCode, node);
        if (!cleanCode.startsWith('0') && cleanCode.length > 0) codeMap.set(`0${cleanCode}`, node);
      }
    });

    // Add synthetic parents
    const syntheticParents = [
      { code: '01.1', name: '01.1 - Receita de Serviços', parentCode: '01' },
      { code: '01.2', name: '01.2 - Receitas de Vendas', parentCode: '01' },
      { code: '02.1', name: '02.1 - Tributos', parentCode: '02' },
      { code: '03.1', name: '03.1 Salarios e Remuneração', parentCode: '03' },
      { code: '03.2', name: '03.2 Encargos Sociais', parentCode: '03' },
      { code: '03.3', name: '03.3 Beneficios', parentCode: '03' },
      { code: '03.4', name: '03.4 Diárias', parentCode: '03' },
      { code: '03.5', name: '03.5 SSMA', parentCode: '03' },
      { code: '03.6', name: '03.6 Materiais', parentCode: '03' },
      { code: '03.7', name: '03.7 Equipamentos', parentCode: '03' },
      { code: '03.8', name: '03.8 Comunicação/Sistema/Licenças', parentCode: '03' },
      { code: '03.9', name: '03.9 Custo com Veiculo', parentCode: '03' },
      { code: '04.1', name: '04.1 Salarios e Remuneração', parentCode: '04' },
      { code: '04.2', name: '04.2 Encargos Sociais', parentCode: '04' },
      { code: '04.3', name: '04.3 Beneficios', parentCode: '04' },
      { code: '04.4', name: '04.4 SSMA', parentCode: '04' },
      { code: '04.5', name: '04.5 Viagens', parentCode: '04' },
      { code: '04.6', name: '04.6 Custo com Veículos', parentCode: '04' },
      { code: '04.7', name: '04.7 Cartão Corporativo', parentCode: '04' },
      { code: '04.8', name: '04.8 Serviços Terceirizados', parentCode: '04' },
      { code: '05.1', name: '05.1 Salario e Remuneração', parentCode: '05' },
      { code: '05.2', name: '05.2 Encargos Sociais', parentCode: '05' },
      { code: '05.3', name: '05.3 Beneficios', parentCode: '05' },
      { code: '05.4', name: '05.4 SSMA', parentCode: '05' },
      { code: '05.5', name: '05.5 Viagens', parentCode: '05' },
      { code: '05.6', name: '05.6 Despesa com Socios', parentCode: '05' },
      { code: '05.7', name: '05.7 Serviços Contratados', parentCode: '05' },
      { code: '05.8', name: '05.8 Despesa Comercial/Marketing', parentCode: '05' },
      { code: '05.9', name: '05.9 Despesa com Estrutura', parentCode: '05' },
      { code: '05.10', name: '05.10 Despesa Copa e Cozinha', parentCode: '05' },
      { code: '05.11', name: '05.11 Despesa com Veículos', parentCode: '05' },
      { code: '05.12', name: '05.12 Despesa de Informatica', parentCode: '05' },
      { code: '05.13', name: '05.13 Taxas e Despesas Legais', parentCode: '05' },
      { code: '06.1', name: '06.1 Entradas Financeiras', parentCode: '06' },
      { code: '06.2', name: '06.2 Saidas Financeiras', parentCode: '06' },
      { code: '06.3', name: '06.3 Financiamento', parentCode: '06' },
      { code: '06.4', name: '06.4 Juros/Multas', parentCode: '06' },
      { code: '06.5', name: '06.5 Passivo Trabalhista', parentCode: '06' },
      { code: '06.6', name: '06.6 Depreciação', parentCode: '06' },
      { code: '06.7', name: '06.7 Cartão de Credito', parentCode: '06' },
      { code: '06.8', name: '06.8 PDD', parentCode: '06' },
    ];

    syntheticParents.forEach(synth => {
      if (!codeMap.has(synth.code)) {
        const node = {
          id: `synth-${synth.code}`,
          name: synth.name,
          code: synth.code,
          children: [],
          level: 0,
          isSynthetic: true,
          tenantId: ''
        };
        map.set(node.id, node);
        codeMap.set(synth.code, node);
      }
    });

    // Linking
    map.forEach(node => {
      const code = node.code || '';
      if (node.isSynthetic) {
        const synthDef = syntheticParents.find(s => s.code === code);
        if (synthDef && synthDef.parentCode) {
          const parent = codeMap.get(synthDef.parentCode);
          if (parent) {
            if (!parent.children.some(c => c.id === node.id)) {
              parent.children.push(node);
            }
          }
        }
        return;
      }
      if (code.startsWith('01.1.')) {
        const parent = codeMap.get('01.1');
        if (parent) { parent.children.push(node); return; }
      }
      if (code.startsWith('01.2.')) {
        const parent = codeMap.get('01.2');
        if (parent) { parent.children.push(node); return; }
      }
      if (code.startsWith('2.1')) {
        const parent = codeMap.get('02.1');
        if (parent) { parent.children.push(node); return; }
      }

      let parentFound = false;
      if (code.includes('.')) {
        let currentPrefix = code.substring(0, code.lastIndexOf('.'));
        while (currentPrefix.length > 0) {
          const potentialParent = Array.from(codeMap.values()).find(n => n.code === currentPrefix);
          if (potentialParent) {
            if (!potentialParent.children.includes(node)) {
              potentialParent.children.push(node);
            }
            parentFound = true;
            break;
          }
          if (!currentPrefix.includes('.')) break;
          currentPrefix = currentPrefix.substring(0, currentPrefix.lastIndexOf('.'));
        }
      }

      if (!parentFound && code.match(/^(0[3456])\.(\d+)\./)) {
        const match = code.match(/^(0[3456])\.(\d+)/);
        if (match) {
          const synthParent = codeMap.get(match[0]);
          if (synthParent) {
            if (!synthParent.children.some(c => c.id === node.id)) {
              synthParent.children.push(node);
            }
          }
        }
      }
    });

    const allChildren = new Set();
    map.forEach(node => node.children.forEach(c => allChildren.add(c.id)));

    const rawRoots = [];
    map.forEach(node => {
      if (!allChildren.has(node.id)) {
        rawRoots.push(node);
      }
    });

    const uniqueRootsMap = new Map();
    rawRoots.forEach(root => {
      const rootCode = root.code || root.name;
      if (uniqueRootsMap.has(rootCode)) {
        const existingRoot = uniqueRootsMap.get(rootCode);
        root.children.forEach(child => {
          if (!existingRoot.children.find(c => c.id === child.id)) {
            existingRoot.children.push(child);
          }
        });
      } else {
        uniqueRootsMap.set(rootCode, root);
      }
    });

    const finalRoots = Array.from(uniqueRootsMap.values());
    console.log('Final Roots codes:', finalRoots.map(r => r.code || r.name));

    // Let's populate realizedValues and budgetValues using both methods
    const realizedValues = {};
    const budgetValues = {};

    realizedEntries.forEach(e => {
      const idKey = `realized-${e.categoryId}-${e.month - 1}`;
      realizedValues[idKey] = (realizedValues[idKey] || 0) + e.amount;

      let catName = categoryNameMap.get(e.categoryId);
      if (catName) {
        const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const nameKey = `${normalizedName}|${e.month - 1}`;
        realizedValues[nameKey] = (realizedValues[nameKey] || 0) + e.amount;
      }
    });

    budgetEntries.forEach(e => {
      const idKey = `${e.categoryId}-${e.month - 1}`;
      budgetValues[idKey] = { amount: (budgetValues[idKey]?.amount || 0) + e.amount };

      let catName = categoryNameMap.get(e.categoryId);
      if (catName) {
        const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const nameKey = `budget-${normalizedName}|${e.month - 1}`;
        budgetValues[nameKey] = { amount: (budgetValues[nameKey]?.amount || 0) + e.amount };
      }
    });

    const totalsMap = new Map();
    const calculateNode = (node) => {
      const childrenTotals = node.children.map(child => calculateNode(child));
      const myBudget = new Array(12).fill(0);
      const myRealized = new Array(12).fill(0);

      childrenTotals.forEach(childTotal => {
        for (let i = 0; i < 12; i++) {
          myBudget[i] += childTotal.budget[i];
          myRealized[i] += childTotal.realized[i];
        }
      });

      for (let i = 0; i < 12; i++) {
        const isDataPoint = !node.isSynthetic && node.children.length === 0;
        if (isDataPoint) {
          const idsToRead = node.id.split(',');
          let sumB = 0, sumR = 0;

          const readNames = new Set();
          idsToRead.forEach(rawId => {
            const cat = categories.find(c => c.id === rawId);
            const nameToUse = cat ? cat.name : node.name;
            const normalizedName = nameToUse.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const lookupKey = `${normalizedName}|${i}`;
            if (!readNames.has(lookupKey)) {
              readNames.add(lookupKey);
              sumR += realizedValues[lookupKey] || 0;
            }
          });

          const readBudgetNames = new Set();
          for (const rawId of idsToRead) {
            const bData = budgetValues[`${rawId}-${i}`] || { amount: 0 };
            if (bData.amount !== 0) {
              sumB += bData.amount;
            } else {
              const cat = categories.find(c => c.id === rawId);
              const nameToUse = cat ? cat.name : node.name;
              const normalizedName = nameToUse.toUpperCase().replace(/[^A-Z0-9]/g, '');
              const lookupKey = `budget-${normalizedName}|${i}`;
              if (!readBudgetNames.has(lookupKey)) {
                readBudgetNames.add(lookupKey);
                const nameBData = budgetValues[lookupKey] || { amount: 0 };
                sumB += nameBData.amount;
              }
            }
          }

          myBudget[i] += sumB;
          myRealized[i] += sumR;
        }
      }

      const res = { budget: myBudget, realized: myRealized };
      totalsMap.set(node.id, res);
      return res;
    };

    finalRoots.forEach(root => calculateNode(root));

    const potentialRoots = finalRoots;
    const sumGroup = (predicate, type) => {
      const roots = potentialRoots.filter(predicate);
      return roots.reduce((acc, root) => {
        const total = totalsMap.get(root.id);
        return acc + (total ? total[type] : new Array(12).fill(0));
      }, new Array(12).fill(0));
    };

    // Predicate: (r.code || '').startsWith('01') || (r.code || '') === '1'
    const budgetTotalRev = sumGroup(r => (r.code || '').startsWith('01') || (r.code || '') === '1', 'budget');
    const realizedTotalRev = sumGroup(r => (r.code || '').startsWith('01') || (r.code || '') === '1', 'realized');

    console.log('--- RECURSIVE GROUP SUM (StartsWith 01 / === 1) ---');
    for (let m = 0; m < 12; m++) {
      console.log(`Month ${m+1}: Budget = ${budgetTotalRev[m].toFixed(2)}, Realized = ${realizedTotalRev[m].toFixed(2)}`);
    }

    console.log('--- ROOT BY ROOT SUM ---');
    potentialRoots.forEach(root => {
      const t = totalsMap.get(root.id);
      console.log(`Root code: ${root.code || root.name} (${root.name}): Budget Jan=${t.budget[0].toFixed(2)}, Realized Jan=${t.realized[0].toFixed(2)}`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
