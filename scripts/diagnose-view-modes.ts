import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Analyzing RealizedEntry view modes...");

    const entries = await prisma.realizedEntry.findMany({
        take: 1000
    });

    console.log(`Total entries: ${entries.length}`);

    const grouped: Record<string, { competencia?: number, caixa?: number }> = {};

    for (const e of entries) {
        const key = `${e.tenantId}-${e.categoryId}-${e.costCenterId || 'NONE'}-${e.month}-${e.year}`;
        if (!grouped[key]) grouped[key] = {};
        if (e.viewMode === 'competencia') grouped[key].competencia = e.amount;
        if (e.viewMode === 'caixa') grouped[key].caixa = e.amount;
    }

    let diffCount = 0;
    let totalCount = 0;

    for (const key in grouped) {
        totalCount++;
        const vals = grouped[key];
        if (vals.competencia !== vals.caixa) {
            diffCount++;
            if (diffCount < 10) {
                console.log(`Diff at ${key}: Comp=${vals.competencia}, Caixa=${vals.caixa}`);
            }
        }
    }

    console.log(`\nStatistics:`);
    console.log(`Total Unique Keys Checked: ${totalCount}`);
    console.log(`Keys with Differences: ${diffCount}`);
    console.log(`Percentage Identical: ${((totalCount - diffCount) / totalCount * 100).toFixed(2)}%`);

    await prisma.$disconnect();
}

main().catch(console.error);
