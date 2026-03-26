import { prisma } from './src/lib/prisma';
async function run() {
    const ccs = await prisma.costCenter.findMany({
        where: {
            OR: [
                { name: { contains: 'Clean Tech' } },
                { name: { contains: 'Rio Negrinho' } },
                { name: { contains: 'REDE TONIN' } }
            ]
        }
    });
    console.log(JSON.stringify(ccs, null, 2));
}
run();
