import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function restore() {
    const dataToRestore = [
        { valor: 2823.45, mes: 1, categoria: "01.1.1 -Serviços Vendidos", ccId: "0eb10d7c-9ad0-11ef-b475-d349c0416d0f", tenantId: "896f30d0-e04f-11ee-90d5-cb0056976932" },
        { valor: 16897.58, mes: 4, categoria: "01.1.1 -Serviços Vendidos", ccId: "6a00de4c-8670-11ef-ab1e-6f11273fac70", tenantId: "896f30d0-e04f-11ee-90d5-cb0056976932" },
        { valor: 31906.22, mes: 1, categoria: "01.1.1 -Serviços Vendidos", ccId: "2c8958ba-be45-11f0-97a6-3bac1e6fd81a", tenantId: "77742da2-c518-11ee-a9bb-d394685e0db5" },
        { valor: 35753.29, mes: 2, categoria: "01.1.1 -Serviços Vendidos", ccId: "91de1850-0368-11f1-b5d3-5f88f82136e9", tenantId: "ed973f7c-c554-11ee-a9bb-d394685e0db5" },
        { valor: 35753.29, mes: 3, categoria: "01.1.1 -Serviços Vendidos", ccId: "91de1850-0368-11f1-b5d3-5f88f82136e9", tenantId: "ed973f7c-c554-11ee-a9bb-d394685e0db5" },
        { valor: 35753.29, mes: 4, categoria: "01.1.1 -Serviços Vendidos", ccId: "91de1850-0368-11f1-b5d3-5f88f82136e9", tenantId: "ed973f7c-c554-11ee-a9bb-d394685e0db5" },
        { valor: 35753.29, mes: 5, categoria: "01.1.1 -Serviços Vendidos", ccId: "91de1850-0368-11f1-b5d3-5f88f82136e9", tenantId: "ed973f7c-c554-11ee-a9bb-d394685e0db5" },
        { valor: 15000, mes: 1, categoria: "05.6.1 - Pró-labore", ccId: "ed973f7c-c554-11ee-a9bb-d394685e0db5", tenantId: "ed973f7c-c554-11ee-a9bb-d394685e0db5" },
        { valor: 15000, mes: 2, categoria: "05.6.1 - Pró-labore", ccId: "ed973f7c-c554-11ee-a9bb-d394685e0db5", tenantId: "ed973f7c-c554-11ee-a9bb-d394685e0db5" }
        // ... (Vou injetar os principais da Clean Tech que foram mostrados no último log)
    ];

    console.log("Iniciando Resgate...");
    for (const entry of dataToRestore) {
        // Buscar o CategoryID baseado no nome e tenant
        const cat = await prisma.category.findFirst({
            where: { name: entry.categoria, tenantId: entry.tenantId }
        });
        
        if (cat) {
            await prisma.budgetEntry.upsert({
                where: {
                    tenantId_categoryId_costCenterId_month_year: {
                        tenantId: entry.tenantId,
                        categoryId: cat.id,
                        costCenterId: entry.ccId,
                        month: entry.mes,
                        year: 2026
                    }
                },
                update: { amount: entry.valor },
                create: {
                    tenantId: entry.tenantId,
                    categoryId: cat.id,
                    costCenterId: entry.ccId,
                    month: entry.mes,
                    year: 2026,
                    amount: entry.valor
                }
            });
            console.log(`Restaurado: ${entry.categoria} - R$ ${entry.valor}`);
        }
    }
    console.log("Resgate Concluído!");
}

restore().catch(console.error).finally(() => prisma.$disconnect());
