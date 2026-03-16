import { prisma } from './src/lib/prisma';

async function audit() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) return console.log("SPOT not found");

    const entries = await prisma.realizedEntry.findMany({
        where: { tenantId: spot.id, year: 2026, month: 1, viewMode: 'caixa' },
        orderBy: { amount: 'desc' }
    });

    console.log(`Auditoria SPOT - Jan/2026 (Caixa) - Total: ${entries.reduce((s, e) => s + e.amount, 0)}`);
    console.log(`Total de registros: ${entries.length}`);

    // Groups by category
    const catGroups: any = {};
    for (const e of entries) {
        const cat = await prisma.category.findUnique({ where: { id: e.categoryId } });
        const name = cat ? cat.name : e.categoryId;
        if (!catGroups[name]) catGroups[name] = 0;
        catGroups[name] += e.amount;
    }
    console.log("Resumo por Categoria:", catGroups);

    // Sample top 10
    console.log("Top 10 LANÇAMENTOS:");
    entries.slice(0, 10).forEach(e => console.log(`- Amount: ${e.amount} | CatID: ${e.categoryId}`));
}

audit();
