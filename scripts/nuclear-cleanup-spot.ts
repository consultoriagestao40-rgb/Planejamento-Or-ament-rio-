import { prisma } from '../src/lib/prisma';

async function nuclearCleanup() {
    console.log("--- INICIANDO LIMPEZA NUCLEAR SPOT (2026) ---");
    
    const spotTenants = await prisma.tenant.findMany({
        where: { name: { contains: 'SPOT', mode: 'insensitive' } },
        select: { id: true, name: true }
    });
    
    const ids = spotTenants.map(t => t.id);
    console.log(`Encontrados ${ids.length} IDs vinculados à SPOT:`, spotTenants.map(t => t.name));

    if (ids.length === 0) return;

    const deleted = await prisma.realizedEntry.deleteMany({
        where: { 
            tenantId: { in: ids },
            year: 2026
        }
    });

    console.log(`Removidos ${deleted.count} lançamentos de 2026.`);
    console.log("Limpeza concluída. Agora você pode sincronizar novamente pelo Dashboard.");
}

nuclearCleanup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
