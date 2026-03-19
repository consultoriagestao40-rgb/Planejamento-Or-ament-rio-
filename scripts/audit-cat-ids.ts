import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function audit() {
    try {
        console.log("--- Category Audit (Rev) ---");
        const revCats = await prisma.category.findMany({
            where: { name: { startsWith: '01' } }
        });
        revCats.forEach(c => {
            console.log(`JSON: ${JSON.stringify({ id: c.id, name: c.name, caId: c.caId, parentId: c.parentId })}`);
        });

        console.log("\n--- Financial Entries Jan 2026 ---");
        const entries = await prisma.financialEntry.findMany({
            where: { 
                date: { 
                    gte: new Date('2026-01-01T00:00:00.000Z'), 
                    lte: new Date('2026-01-31T23:59:59.999Z') 
                } 
            },
            include: { category: true }
        });
        
        console.log(`Total entries for Jan 2026: ${entries.length}`);
        
        const summary: Record<string, any> = {};
        entries.forEach(e => {
            const catName = e.category?.name || 'Unknown';
            const catId = e.category?.id || 'Unknown';
            const key = `${catName} | ${catId}`;
            if (!summary[key]) summary[key] = { count: 0, total: 0 };
            summary[key].count++;
            summary[key].total += Number(e.amount);
        });
        
        console.log("Summary Table:");
        Object.entries(summary).forEach(([key, data]) => {
            console.log(`${key}: Count=${data.count}, Total=${data.total.toFixed(2)}`);
        });
    } catch (e) {
        console.error(e);
    }
}

audit().catch(console.error).finally(() => prisma.$disconnect());
