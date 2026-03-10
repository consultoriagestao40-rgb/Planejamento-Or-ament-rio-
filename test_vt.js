const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    const category = await prisma.category.findFirst({ where: { name: { contains: 'Vale Transporte' }, tenantId: tenant.id } });
    console.log("Category ID:", category.id);
    
    // Now call the local API
    const url = `http://localhost:3000/api/transactions?categoryId=${category.id}&month=0&year=2026&tenantId=${tenant.id}`;
    console.log("Fetching:", url);
    // Since we can't easily start the server, let's just use the Vercel production URL
    const prodUrl = `https://planejamento-or-ament-rio.vercel.app/api/transactions?categoryId=${category.id}&month=0&year=2026&tenantId=ALL`;
    console.log("Fetching Prod:", prodUrl);
    
    const res = await fetch(prodUrl);
    const data = await res.json();
    
    console.log(`Found ${data.transactions?.length || 0} transactions.`);
    if (data.transactions) {
        data.transactions.forEach(t => {
            console.log(`\nCC: ${t.costCenters.map(c=>c.nome).join(', ')}`);
            console.log(`Value: ${t.value}`);
            console.log(`Desc: ${t.description}`);
            console.log(`Date: ${t.date}`);
        });
    }
}
main().finally(() => prisma.$disconnect());
