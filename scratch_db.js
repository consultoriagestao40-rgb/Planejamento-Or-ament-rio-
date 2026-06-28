const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Connecting to DB...");
    try {
        const categories = await prisma.category.findMany({
            select: { id: true, name: true, code: true, tenantId: true }
        });
        const cat06 = categories.filter(c => {
            const code = c.code || '';
            const name = c.name || '';
            return code.startsWith('06') || code.startsWith('6') || name.startsWith('06') || name.startsWith('6.');
        });
        console.log("Categories found:", cat06.length);
        cat06.forEach(c => {
            console.log(`ID: ${c.id} | Code: ${c.code} | Name: ${c.name} | TenantId: ${c.tenantId}`);
        });
    } catch (e) {
        console.error("DB Query failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
