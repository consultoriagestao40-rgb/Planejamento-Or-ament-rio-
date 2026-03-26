const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const cats = await prisma.category.findMany({
        where: {
            OR: [
                { id: { contains: '01.1' } },
                { name: { contains: '01.1' } },
                { name: { contains: 'Receita de Serviços' } }
            ]
        },
        select: { id: true, name: true, parentId: true }
    });
    console.log("CATEGORY MATCHES:", JSON.stringify(cats, null, 2));

    if (cats.length > 0) {
        const children = await prisma.category.findMany({
            where: {
                parentId: { in: cats.map(c => c.id) }
            },
            select: { id: true, name: true, parentId: true }
        });
        console.log("CHILDREN:", JSON.stringify(children, null, 2));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
