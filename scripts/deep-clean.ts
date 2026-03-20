import { prisma } from '../src/lib/prisma';

async function main() {
    console.log("🕵️ Buscando registros de Jan/Fev 2026...");
    
    // Buscar todos os tenants que tenham "SPOT" no nome
    const tenants = await prisma.tenant.findMany({
        where: { name: { contains: 'SPOT', mode: 'insensitive' } }
    });
    
    const ids = tenants.map(t => t.id);
    console.log("Tenants encontrados:", tenants.map(t => `${t.name} (${t.id})`));

    const total = await prisma.realizedEntry.count({
        where: {
            tenantId: { in: ids },
            year: 2026,
            month: { in: [1, 2] }
        }
    });

    console.log(`Encontrados ${total} registros.`);

    if (total > 0) {
        const del = await prisma.realizedEntry.deleteMany({
            where: {
                tenantId: { in: ids },
                year: 2026,
                month: { in: [1, 2] }
            }
        });
        console.log(`✅ Sucesso! ${del.count} registros deletados.`);
    } else {
        console.log("Nada para deletar.");
    }
}

main().catch(console.error);
