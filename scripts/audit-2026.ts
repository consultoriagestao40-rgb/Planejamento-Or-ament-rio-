import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    console.log('--- AUDIT 2026 ---');
    const total = await prisma.realizedEntry.aggregate({
        where: { year: 2026, viewMode: 'competencia' },
        _sum: { amount: true }
    });
    console.log('Total Competência 2026:', total._sum.amount);

    const jan = await prisma.realizedEntry.aggregate({
        where: { year: 2026, month: 1, viewMode: 'competencia' },
        _sum: { amount: true }
    });
    console.log('Total JAN 2026 (Competência):', jan._sum.amount);

    const janCaixa = await prisma.realizedEntry.aggregate({
        where: { year: 2026, month: 1, viewMode: 'caixa' },
        _sum: { amount: true }
    });
    console.log('Total JAN 2026 (Caixa):', janCaixa._sum.amount);

    // List top categories to spot anomalies
    const topCats = await prisma.realizedEntry.groupBy({
        by: ['categoryId'],
        where: { year: 2026, month: 1, viewMode: 'competencia' },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10
    });

    const categoryNames = await prisma.category.findMany({
        where: { id: { in: topCats.map(c => c.categoryId) } }
    });

    console.log('\nTop 10 Categorias JAN 2026 (Competência):');
    topCats.forEach(c => {
        const name = categoryNames.find(cn => cn.id === c.categoryId)?.name || c.categoryId;
        console.log(`${name}: ${c._sum.amount}`);
    });
}

check()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
