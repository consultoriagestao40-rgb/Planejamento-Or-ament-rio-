
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const cc = await prisma.costCenter.findFirst({
        where: { name: { contains: 'CONDOR MECÊS' } }
    });
    if (!cc) { console.log("CC Not Found"); return; }
    
    console.log(`CC: ${cc.name} ID: ${cc.id}`);
    
    const entries = await prisma.budgetEntry.findMany({
        where: { costCenterId: cc.id, year: 2026 },
        include: { category: true }
    });
    
    console.log(`Total Entries: ${entries.length}`);
    const sum = entries.reduce((acc, e) => acc + (e.amount || 0), 0);
    console.log(`Total Amount: ${sum}`);
    
    entries.forEach(e => {
        console.log(`- Amt: ${e.amount} | CatID: ${e.categoryId} | CatName: ${e.category?.name || 'NULL'} | Month: ${e.month}`);
    });
}

main();
