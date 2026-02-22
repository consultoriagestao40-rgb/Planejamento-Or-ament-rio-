import { prisma } from './src/lib/prisma';
async function main() {
    const cats = await prisma.category.findMany({
        where: { id: { in: ['766f2181-e154-4b58-b073-ccdbb714562f', '23b9c662-feca-4284-a11d-39bce5c233fc', 'c745eb3d-ffff-4ef5-b33b-2d600303306a'] } }
    });
    console.log(cats);
}
main();
