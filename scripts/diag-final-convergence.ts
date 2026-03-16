import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    console.log('--- FINAL AUDIT v0.7.0 ---');
    const allTenants = await prisma.tenant.findMany();
    const companyGroups = new Map<string, string[]>();
    allTenants.forEach((t: any) => {
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
        if (!companyGroups.has(key)) companyGroups.set(key, []);
        companyGroups.get(key)!.push(t.id);
    });

    const primaryIds = Array.from(companyGroups.values()).map(ids => ids.sort()[0]);
    console.log('Primary Tenant IDs:', primaryIds);

    for (const pid of primaryIds) {
        const tenant = allTenants.find(t => t.id === pid);
        const total = await prisma.realizedEntry.aggregate({
            where: { tenantId: pid, year: 2026, viewMode: 'competencia' },
            _sum: { amount: true }
        });
        console.log(`Company: ${tenant?.name} (${pid}) -> Total 2026: ${total._sum.amount || 0}`);

        const jan = await prisma.realizedEntry.aggregate({
            where: { tenantId: pid, year: 2026, month: 1, viewMode: 'competencia' },
            _sum: { amount: true }
        });
        console.log(`   JAN 2026: ${jan._sum.amount || 0}`);
    }

    const totalGlobal = await prisma.realizedEntry.aggregate({
        where: { year: 2026, viewMode: 'competencia' },
        _sum: { amount: true }
    });
    console.log('GLOBAL TOTAL 2026:', totalGlobal._sum.amount || 0);
}

check().catch(console.error).finally(() => prisma.$disconnect());
