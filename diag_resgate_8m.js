const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- AUDITORIA DE RESGATE DRE (8.3M) ---");
    
    // 1. Total Geral
    const total = await prisma.budgetEntry.aggregate({
        _sum: { amount: true },
        _count: { _all: true }
    });
    console.log(`\nESTADO ATUAL NO BANCO:`);
    console.log(`Total de Registros: ${total._count._all}`);
    console.log(`Soma Total: R$ ${total._sum.amount?.toLocaleString('pt-BR') || 0}`);

    // 2. Distribuição por Tenant (Empresa)
    const byTenant = await prisma.budgetEntry.groupBy({
        by: ['tenantId'],
        _sum: { amount: true },
        _count: { _all: true }
    });
    
    console.log("\nDISTRIBUIÇÃO POR EMPRESA (TENANT):");
    console.table(byTenant.map(t => ({
        ID: t.tenantId || 'ORFÃO (null)',
        Soma: t._sum.amount?.toLocaleString('pt-BR') || 0,
        Qtd: t._count._all
    })));

    // 3. Verificação de Categorias Órfãs
    const budgetsWithNoCat = await prisma.budgetEntry.findMany({
        where: { categoryId: null },
        _count: true
    });
    console.log(`\nRegistros sem CategoryId: ${budgetsWithNoCat.length}`);

    // 4. Amostra de nomes de categorias para bater com o Dashboard
    const sample = await prisma.budgetEntry.findMany({
        take: 5,
        include: { category: true }
    });
    console.log("\nAMOSTRA DE CATEGORIAS:");
    sample.forEach(s => {
        console.log(`- Nome: "${s.category?.name}", Valor: R$ ${s.amount}, Tenant: ${s.tenantId}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
