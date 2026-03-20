import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function diag() {
    console.log("🔍 [DIAG-JAN] Extraindo lançamentos de Janeiro 2026...");
    
    // Busca TODOS os lançamentos de Janeiro 2026
    const entries = await prisma.realizedEntry.findMany({
        where: { month: 1, year: 2026 },
        include: {
            // Se houver relações, incluir. Mas o schema parece simples.
        }
    });

    const categories = await prisma.category.findMany({});
    const catMap = new Map(categories.map(c => [c.id, c.name]));

    let totalRevenue = 0;
    const report = entries.map(e => {
        const catName = catMap.get(e.categoryId) || "DESCONHECIDA";
        if (catName.startsWith("01")) totalRevenue += e.amount;
        
        return {
            tenantId: e.tenantId,
            categoryId: e.categoryId,
            categoryName: catName,
            ccId: e.costCenterId,
            amount: e.amount,
            desc: e.description
        };
    });

    console.log(`✅ Total de Lançamentos: ${report.length}`);
    console.log(`💰 Total Receita (Começa com 01): ${totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    
    fs.writeFileSync('diag-jan-entries.json', JSON.stringify({
        summary: {
            count: report.length,
            totalRevenue
        },
        entries: report
    }, null, 2));
    
    console.log("📄 Relatório salvo em diag-jan-entries.json");
}

diag().catch(console.error);
