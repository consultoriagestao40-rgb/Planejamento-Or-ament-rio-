const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- SPOT REGISTERS JAN 2026 ---");
    const entries = await prisma.realizedEntry.findMany({
        where: { year: 2026, month: 1 },
        select: { tenantId: true, viewMode: true, amount: true, categoryId: true }
    });
    console.log(JSON.stringify(entries, null, 2));
}

main().catch(console.error);
