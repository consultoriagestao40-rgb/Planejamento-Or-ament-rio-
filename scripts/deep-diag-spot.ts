import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deepDiag() {
    const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT FACILITIES
    const year = 2026;
    const month = 1;

    try {
        console.log(`--- Deep Diagnostic: ${tenantId} | ${year}-${month} | Competencia ---`);
        
        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId, year, month, viewMode: 'competencia' },
            include: { category: true }
        });

        console.log(`Total Entries Found: ${entries.length}`);

        const cats: any = {};
        entries.forEach(e => {
            const cname = e.category?.name || 'Unknown';
            if (!cats[cname]) cats[cname] = { total: 0, items: [] };
            cats[cname].total += e.amount;
            cats[cname].items.push({
                desc: e.description,
                amt: e.amount.toFixed(2),
                id: e.externalId
            });
        });

        Object.keys(cats).forEach(name => {
            console.log(`\nCATEGORY: ${name} | TOTAL: ${cats[name].total.toFixed(2)}`);
            // Show first 5 items
            cats[name].items.slice(0, 5).forEach((it: any) => {
                console.log(`  - [${it.amt}] ${it.desc} (${it.id})`);
            });
            if (cats[name].items.length > 5) console.log(`  ... and ${cats[name].items.length - 5} more.`);
        });

    } catch (e) {
        console.error(e);
    }
}

deepDiag().catch(console.error).finally(() => prisma.$disconnect());
