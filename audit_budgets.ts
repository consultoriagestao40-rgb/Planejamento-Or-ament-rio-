import { prisma } from './src/lib/prisma';

async function audit() {
    const year = 2026;
    const allBudgets = await prisma.budgetEntry.findMany({
        where: { year }
    });
    
    console.log(`Total Budgets in ${year}:`, allBudgets.length);
    
    const nullCC = allBudgets.filter((b: any) => !b.costCenterId).length;
    console.log(`Budgets with costCenterId NULL:`, nullCC);
    
    const activeCCs = await prisma.costCenter.findMany({
        where: { NOT: { name: { contains: '[INATIVO]' } } }
    });
    const activeIds = new Set(activeCCs.map((cc: any) => cc.id));
    
    const matchedActive = allBudgets.filter((b: any) => b.costCenterId && activeIds.has(b.costCenterId)).length;
    console.log(`Budgets matched to ACTIVE CCs:`, matchedActive);
    
    const matchedInactive = allBudgets.filter((b: any) => b.costCenterId && !activeIds.has(b.costCenterId)).length;
    console.log(`Budgets matched to INACTIVE CCs:`, matchedInactive);
    
    if (activeCCs.length > 0) {
        console.log('Sample Active CC:', activeCCs[0].id, activeCCs[0].name);
        const sampleBudget = allBudgets.find((b: any) => b.costCenterId === activeCCs[0].id);
        console.log('Sample Budget for Active CC:', sampleBudget ? 'FOUND' : 'NOT FOUND');
    }
}

audit();
