import { prisma } from '../src/lib/prisma';

async function main() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) {
        console.error("Tenant SPOT não encontrado!");
        return;
    }
    console.log(`Tenant SPOT Encontrado: ID=${spot.id}, Name=${spot.name}`);

    // Pegando todas as categorias
    const categories = await prisma.category.findMany();
    const catMap = new Map<string, any>();
    for (const cat of categories) {
        catMap.set(cat.id, cat);
    }

    // Pegando todos os centros de custo
    const ccs = await prisma.costCenter.findMany({ where: { tenantId: spot.id } });
    const ccMap = new Map<string, string>();
    for (const cc of ccs) {
        ccMap.set(cc.id, cc.name);
    }

    // Realized entries
    const entries = await prisma.realizedEntry.findMany({
        where: {
            tenantId: spot.id,
            year: 2026,
            month: 5,
            viewMode: 'competencia'
        }
    });

    console.log(`\n--- LANÇAMENTOS DE COMPETÊNCIA - MAIO/2026 (Total: ${entries.length}) ---`);
    const byCategory: Record<string, number> = {};
    for (const e of entries) {
        const cat = catMap.get(e.categoryId);
        const catName = cat ? cat.name : e.categoryId;
        const ccName = e.costCenterId ? ccMap.get(e.costCenterId) || e.costCenterId : "Sem CC";
        
        byCategory[e.categoryId] = (byCategory[e.categoryId] || 0) + e.amount;
        console.log(`- Categoria: ${catName} (${e.categoryId}) | CC: ${ccName} | Valor: ${e.amount.toFixed(2)} | ExtId: ${e.externalId}`);
    }

    console.log("\n--- RESUMO POR CATEGORIA ---");
    let totalRevenue = 0;
    let totalExpenses = 0;
    
    for (const [catId, amount] of Object.entries(byCategory)) {
        const cat = catMap.get(catId);
        const catName = cat ? cat.name : catId;
        console.log(`- ${catName.padEnd(50)}: R$ ${amount.toFixed(2)}`);
        
        // Se a categoria ou sua categoria pai for de receita (começa com "01")
        if (catName.startsWith("01.") || (cat && cat.parentId && catMap.get(cat.parentId)?.name.startsWith("01."))) {
            totalRevenue += amount;
        } else {
            totalExpenses += amount;
        }
    }

    console.log(`\nTotal Receitas (Grupo 01): R$ ${totalRevenue.toFixed(2)}`);
    console.log(`Total Despesas (Outros): R$ ${totalExpenses.toFixed(2)}`);
}

main().catch(console.error);
