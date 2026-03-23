const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetNames = [
        'MRV - LOJA BRASIL',
        'MRV - LOJA JOHN KENNEDY',
        'MRV - LOJA SENSIA CURITIBA',
        'MRV - LOJA SENSIA LONDRINA',
        'MRV - LOJA SENSIA MARINGA',
        'MRV - PL VENDAS FATEC'
    ];

    const normalize = (name) => 
        (name || '').toLowerCase()
            .replace(/^\[inativo\]\s*/i, '')
            .replace(/^encerrado\s*/i, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();

    console.log('--- DIAGNOSTIC START ---');

    for (const name of targetNames) {
        console.log(`\nChecking: "${name}"`);
        const norm = normalize(name);
        
        const ccs = await prisma.costCenter.findMany({
            where: {
                OR: [
                    { name: { contains: name } },
                    { name: { contains: name.replace('MRV - ', '') } }
                ]
            },
            include: { tenant: true }
        });

        const matchedCcs = ccs.filter(cc => normalize(cc.name) === norm);
        console.log(`Found ${matchedCcs.length} matching CostCenters.`);
        
        if (matchedCcs.length > 0) {
            const ccIds = matchedCcs.map(cc => cc.id);
            const tenantIds = Array.from(new Set(matchedCcs.map(cc => cc.tenantId)));

            const budgets = await prisma.budgetEntry.findMany({
                where: {
                    tenantId: { in: tenantIds },
                    year: 2026
                }
            });

            const directBudget = budgets.filter(b => b.costCenterId && ccIds.includes(b.costCenterId));
            
            console.log(`- Direct BudgetEntries for these IDs: ${directBudget.length}`);
            const totalDirect = directBudget.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
            console.log(`- Total Direct Amount: ${totalDirect}`);
            
            if (totalDirect === 0 && budgets.length > 0) {
                console.log(`- Tenant has ${budgets.length} budget entries total for 2026.`);
                const mappedBudgets = budgets.filter(b => b.costCenterId);
                console.log(`- Mapped BudgetEntries (with some CC ID): ${mappedBudgets.length}`);
                
                const otherCcIds = Array.from(new Set(mappedBudgets.map(b => b.costCenterId).filter(id => !ccIds.includes(id))));
                if (otherCcIds.length > 0) {
                    const otherCcs = await prisma.costCenter.findMany({
                        where: { id: { in: otherCcIds } },
                        select: { id: true, name: true }
                    });
                    console.log(`- Other CCs in these tenants with budgets:`, otherCcs.map(cc => cc.name).slice(0, 10), otherCcs.length > 10 ? '...' : '');
                    
                    // Check if any of these "other" CCs have the same normalized name!
                    const synonymous = otherCcs.filter(cc => normalize(cc.name) === norm);
                    if (synonymous.length > 0) {
                        console.log(`!!! Found synonyms with budgets that WERE NOT in our matchedCcs list!`, synonymous.map(s => s.name));
                    }
                }
            }
        } else {
            console.log(`! No CostCenter found matching normalized name: ${norm}`);
            // Check if there are ANY CCs in MRV tenants
            const mrvTenants = await prisma.tenant.findMany({ where: { name: { contains: 'MRV' } } });
            const mrvIds = mrvTenants.map(t => t.id);
            const allMrvCcs = await prisma.costCenter.findMany({ where: { tenantId: { in: mrvIds } } });
            console.log(`Total CCs in MRV tenants: ${allMrvCcs.length}`);
            const sample = allMrvCcs.slice(0, 5).map(c => c.name);
            console.log(`Sample CC names:`, sample);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
