import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } }
});

async function main() {
    const year = 2026;
    const viewMode = 'competencia';
    
    console.log(`--- DIAGNÓSTICO: RealizedEntry (${year}, ${viewMode}) ---`);
    const count = await prisma.realizedEntry.count({
        where: { year, viewMode }
    });
    console.log(`Total de entradas encontradas: ${count}`);

    if (count > 0) {
        const entries = await prisma.realizedEntry.findMany({
            where: { year, viewMode },
            take: 5
        });
        console.log('Exemplo das primeiras 5 entradas:');
        entries.forEach(e => {
            console.log(`- Tenant: ${e.tenantId} | Cat: ${e.categoryId} | Mês: ${e.month} | Valor: ${e.amount}`);
        });

        // Verificar categorias
        const firstCatId = entries[0].categoryId;
        const cat = await prisma.category.findUnique({
            where: { id: firstCatId }
        });
        console.log(`Verificação de Categoria (${firstCatId}): ${cat ? cat.name : 'NÃO ENCONTRADA'}`);
    } else {
        console.log('NENHUMA entrada encontrada para o período especificado.');
    }

    // Verificar Tenants
    const tenants = await prisma.tenant.findMany();
    console.log(`\nTotal de Tenants no banco: ${tenants.length}`);
    tenants.forEach(t => {
        console.log(`- ${t.name} (ID: ${t.id})`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
