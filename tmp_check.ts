import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const cats = await prisma.category.findMany({
        where: { name: { contains: "Salários" } }
    });
    const catIds = cats.map(c => c.id);
    const entries = await prisma.budgetEntry.findMany({
        where: { categoryId: { in: catIds }, month: 2, year: 2025 }
    });
    console.log(entries.map(e => ({ id: e.id, cat: e.categoryId, tenant: e.tenantId, amt: e.amount, month: e.month })));
}
main().finally(() => prisma.$disconnect());
