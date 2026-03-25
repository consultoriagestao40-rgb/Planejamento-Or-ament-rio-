
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Encontrar o CC "Condor Merces"
    const cc = await prisma.costCenter.findFirst({
        where: { name: { contains: 'CONDOR MECÊS' } }
    });

    if (!cc) {
        console.log("CC não encontrado");
        return;
    }

    console.log(`CC Encontrado: ${cc.name} (ID: ${cc.id})`);

    // 2. Buscar lançamentos de orçamento para esse CC em 2026
    const entries = await prisma.budgetEntry.findMany({
        where: {
            costCenterId: cc.id,
            year: 2026
        },
        include: {
            category: true
        }
    });

    console.log(`Total de lançamentos encontrados: ${entries.length}`);
    
    const orphans = entries.filter(e => !e.category);
    const valid = entries.filter(e => e.category);

    console.log(`\n--- ÓRFÃOS (Sem Categoria) ---`);
    orphans.forEach(e => {
        console.log(`ID: ${e.id}, CategoryID: ${e.categoryId}, Amount: ${e.amount}, Month: ${e.month}`);
    });

    console.log(`\n--- VÁLIDOS ---`);
    valid.forEach(e => {
        console.log(`ID: ${e.id}, Category: ${e.category.name} (ID: ${e.categoryId}), Amount: ${e.amount}, Month: ${e.month}`);
    });

    // 3. Tentar encontrar categorias sinônimas para os órfãos baseando-se em outros registros
    // Se não houver nome, estamos no escuro.
}

main().catch(console.error).finally(() => prisma.$disconnect());
