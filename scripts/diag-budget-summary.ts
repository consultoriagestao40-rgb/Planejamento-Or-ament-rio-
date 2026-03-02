import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- DIAGNÓSTICO DE ORÇAMENTO (AMERICA / CONDOR) ---');

    // 1. Encontrar Centros de Custo
    const ccs = await prisma.costCenter.findMany({
        where: {
            OR: [
                { name: { contains: 'AMERICA', mode: 'insensitive' } },
                { name: { contains: 'CONDOR', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`Encontrados ${ccs.length} Centros de Custo:`);
    ccs.forEach(cc => console.log(`- [${cc.id}] ${cc.name} (Tenant: ${cc.tenantId})`));

    const currentYear = new Date().getFullYear();

    for (const cc of ccs) {
        console.log(`\nAnalisando CC: ${cc.name} (ID: ${cc.id})`);

        const entries = await prisma.budgetEntry.findMany({
            where: {
                costCenterId: cc.id,
                year: currentYear
            },
            include: {
                category: true
            }
        });

        console.log(`Lançamentos encontrados em ${currentYear}: ${entries.length}`);

        if (entries.length > 0) {
            // Agrupar por categoria para ver o que está acontecendo
            const summaryByCategory = new Map();
            entries.forEach(e => {
                const cat = e.category;
                const key = cat.id;
                if (!summaryByCategory.has(key)) {
                    summaryByCategory.set(key, {
                        name: cat.name,
                        type: cat.type,
                        total: 0,
                        mappedAs: cat.type === 'REVENUE' ? 'RECEITA' : 'DESPESA'
                    });
                }
                summaryByCategory.get(key).total += e.amount;
            });

            console.table(Array.from(summaryByCategory.values()));
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
