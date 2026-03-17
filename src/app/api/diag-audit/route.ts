import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spotTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } }
        });
        const ids = spotTenants.map(t => t.id);

        const entries = await prisma.realizedEntry.findMany({
            where: { 
                tenantId: { in: ids }, 
                month: 1, 
                year: 2026, 
                viewMode: 'competencia' 
            },
            include: { category: true }
        });

        const targetList = [
            { desc: "Venda 631", val: 2912.75 },
            { desc: "Venda 649", val: 6259.00 },
            { desc: "Venda 638", val: 3050.00 },
            { desc: "Venda 652", val: 4907.05 },
            { desc: "Venda 655", val: 1004.21 },
            { desc: "Venda 654", val: 9814.10 },
            { desc: "Venda 653", val: 1098.22 },
            { desc: "Venda 666", val: 244.26 },
            { desc: "Venda 663", val: 9565.65 },
            { desc: "Venda 660", val: 5022.51 },
            { desc: "Venda 661", val: 6314.28 },
            { desc: "Venda 664", val: 6314.28 },
            { desc: "Venda 659", val: 10025.22 },
            { desc: "Venda 662", val: 9565.65 },
            { desc: "Venda 658", val: 9565.65 },
            { desc: "Venda 665", val: 9565.65 }
        ];

        const missing: any[] = [];
        const extra: any[] = [];
        
        targetList.forEach(t => {
            const found = entries.find(e => e.description?.includes(t.desc.split(' ')[1]));
            if (!found) missing.push(t);
        });

        entries.forEach(e => {
            const found = targetList.find(t => e.description?.includes(t.desc.split(' ')[1]));
            if (!found && e.category.name.includes('01.2.1')) extra.push({ desc: e.description, val: e.amount });
        });

        return NextResponse.json({
            summary: {
                total_db: entries.reduce((s, e) => s + e.amount, 0),
                vendas_db: entries.filter(e => e.category.name.includes('01.2.1')).reduce((s, e) => s + e.amount, 0),
                target_total: 165527.25,
                target_vendas: 95228.48
            },
            discrepancies: {
                missing_in_db: missing,
                extra_in_db: extra
            },
            all_entries: entries.map(e => `${e.description} | ${e.category.name} | ${e.amount}`)
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
