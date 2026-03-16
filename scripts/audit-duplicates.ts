import { prisma } from './src/lib/prisma';

async function audit() {
    const spotTenants = await prisma.tenant.findMany({
        where: { name: { contains: 'SPOT', mode: 'insensitive' } }
    });
    const ids = spotTenants.map(t => t.id);
    
    const entries = await prisma.realizedEntry.findMany({
        where: { 
            tenantId: { in: ids },
            month: 0,
            year: 2026,
            viewMode: 'competencia'
        },
        include: { category: true }
    });

    console.log(`Total entries for SPOT in Jan 2026: ${entries.length}`);
    
    const byDesc: Record<string, { count: number, total: number, cats: string[] }> = {};
    entries.forEach(e => {
        const key = e.description || 'NO_DESC';
        if (!byDesc[key]) byDesc[key] = { count: 0, total: 0, cats: [] };
        byDesc[key].count++;
        byDesc[key].total += e.amount;
        byDesc[key].cats.push(e.category.name);
    });

    const duplicates = Object.entries(byDesc).filter(([k, v]) => v.count > 1);
    console.log('--- DUPLICATED DESCRIPTIONS ---');
    duplicates.forEach(([desc, stats]) => {
        console.log(`${desc}: ${stats.count} times | Total: ${stats.total} | Categories: ${stats.cats.join(', ')}`);
    });

    const total = entries.reduce((acc, e) => acc + e.amount, 0);
    console.log(`Total Realizado (Grid Sum): ${total}`);
}

audit();
