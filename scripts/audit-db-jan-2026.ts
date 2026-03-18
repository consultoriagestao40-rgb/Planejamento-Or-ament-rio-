import { PrismaClient } from '@prisma/client';
import { normalizeTenantName } from './src/lib/tenant-utils';

const prisma = new PrismaClient();

async function main() {
    console.log("=== AUDIT JAN 2026 ===");
    
    const entries = await prisma.realizedEntry.findMany({
        where: { year: 2026, month: 1 },
        include: { 
            category: { select: { id: true, name: true, tenantId: true } },
            tenant: { select: { name: true } }
        }
    });

    console.log(`Total entries found for JAN 2026: ${entries.length}`);
    
    const summary: Record<string, { total: number, count: number, companies: Set<string> }> = {};
    
    entries.forEach(e => {
        const catName = e.category.name.trim();
        if (!summary[catName]) summary[catName] = { total: 0, count: 0, companies: new Set() };
        summary[catName].total += e.amount;
        summary[catName].count++;
        summary[catName].companies.add(e.tenant.name);
    });

    console.log("\n--- Category Summary (All Companies Combined) ---");
    Object.entries(summary)
        .sort((a,b) => b[1].total - a[1].total)
        .forEach(([name, data]) => {
            console.log(`${name.padEnd(40)} | R$ ${data.total.toLocaleString('pt-BR', {minimumFractionDigits:2})} | Count: ${data.count} | ${Array.from(data.companies).join(', ')}`);
        });

    const revenueTotal = Object.entries(summary)
        .filter(([name]) => name.startsWith('01.'))
        .reduce((acc, [_, d]) => acc + d.total, 0);

    console.log(`\nTOTAL REVENUE (01.*): R$ ${revenueTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}`);
    console.log(`Target Revenue: R$ 753.476,66`);
    console.log(`Difference: R$ ${(753476.66 - revenueTotal).toLocaleString('pt-BR', {minimumFractionDigits:2})}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
