const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting...");
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    if (!tenant) return console.log("No tenant");
    const category = await prisma.category.findFirst({ where: { name: { contains: 'Vale Transporte' }, tenantId: tenant.id } });
    if (!category) return console.log("No category");
    console.log("Category ID:", category.id);
    
    const prodUrl = `https://planejamento-or-ament-rio.vercel.app/api/transactions?categoryId=${category.id}&month=0&year=2026&tenantId=ALL`;
    console.log("Fetching Prod:", prodUrl);
    
    try {
        const res = await fetch(prodUrl);
        const data = await res.json();
        
        console.log(`Found ${data.transactions?.length || 0} transactions.`);
        if (data.transactions) {
            data.transactions.forEach(t => {
                if (t.tenantName === 'JVS FACILITIES') {
                    console.log(`\nCC: ${t.costCenters.map(c=>c.nome).join(', ')}`);
                    console.log(`Value: ${t.value}`);
                    console.log(`Desc: ${t.description}`);
                    console.log(`Date: ${t.date}`);
                }
            });
        }
    } catch (e) {
        console.error("Fetch error:", e.message);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
