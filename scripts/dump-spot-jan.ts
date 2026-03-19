import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const spotId = 'e2079373-f938-4eac-aae3-43edef291129'; // ID da SPOT
    const entries = await prisma.realizedEntry.findMany({
        where: { tenantId: spotId, year: 2026, month: 1 },
        select: { id: true, amount: true, viewMode: true, description: true, externalId: true }
    });
    console.log(`Found ${entries.length} entries for SPOT in Jan 2026`);
    console.log(JSON.stringify(entries, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
