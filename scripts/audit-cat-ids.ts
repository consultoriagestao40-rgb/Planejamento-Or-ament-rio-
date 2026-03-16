import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- AUDITING SPOT CATEGORIES ---');
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) {
        console.log('SPOT not found');
        return;
    }
    console.log(`SPOT ID: ${spot.id}`);

    const cats = await prisma.category.findMany({
        where: { tenantId: spot.id },
        select: { id: true, name: true }
    });

    console.log(`Found ${cats.length} categories.`);
    console.log('Sample IDs:', cats.slice(0, 5).map(c => c.id));
    
    // Check for the specific ID found in debug
    const target = 'c3c491af-26f8-4260-9958-64222c73dffd';
    const match = cats.find(c => c.id.includes(target));
    console.log(`Match for ${target}:`, match ? 'YES' : 'NO');
    if (match) console.log(`Actual DB ID: ${match.id}`);
}

main();
