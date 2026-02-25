import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const categories = await prisma.category.findMany({
        where: { name: "05.6.1 - Pró-labore" },
        include: { tenant: { select: { name: true } } }
    });
    console.log("Categories for '05.6.1 - Pró-labore':", JSON.stringify(categories, null, 2));
}
check().finally(() => prisma.$disconnect());
