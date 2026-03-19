import { prisma } from './src/lib/prisma';

async function checkSync() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) return;
    
    const count = await prisma.realizedEntry.count({
        where: { tenantId: spot.id, year: 2026, month: 1, viewMode: 'competencia' }
    });
    
    const sum = await prisma.realizedEntry.aggregate({
        where: { tenantId: spot.id, year: 2026, month: 1, viewMode: 'competencia' },
        _sum: { amount: true }
    });
    
    console.log(`SPOT Jan 2026 Competencia: Count=${count}, Sum=${sum._sum.amount}`);
}
checkSync();
