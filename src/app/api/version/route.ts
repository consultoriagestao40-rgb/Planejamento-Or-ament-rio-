import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: { category: true }
        });
        
        // Group by category name
        const summary: Record<string, { name: string, amount: number, code: string | null, entradaDre: string | null, count: number }> = {};
        entries.forEach(e => {
            const cat = e.category;
            const name = cat.name;
            const code = cat.name.split(' - ')[0] || '';
            const key = name;
            if (!summary[key]) {
                summary[key] = { name, amount: 0, code, entradaDre: cat.entradaDre, count: 0 };
            }
            summary[key].amount += e.amount;
            summary[key].count += 1;
        });

        // Group by DRE code group (e.g. 01, 02, 03, etc.)
        const groups: Record<string, number> = {};
        Object.values(summary).forEach(s => {
            let group = 'None';
            if (s.name.startsWith('01') || s.name.startsWith('1.')) group = '01. RECEITA BRUTA';
            else if (s.name.startsWith('02') || s.name.startsWith('2.')) group = '02. TRIBUTO SOBRE FATURAMENTO';
            else if (s.name.startsWith('03') || s.name.startsWith('3.')) group = '03. CUSTO OPERACIONAL';
            else if (s.name.startsWith('04') || s.name.startsWith('4.')) group = '04. DESPESA OPERACIONAL';
            else if (s.name.startsWith('05') || s.name.startsWith('5.')) group = '05. DESPESAS ADMINISTRATIVAS';
            else if (s.name.startsWith('06') || s.name.startsWith('6.')) group = '06. DESPESAS FINANCEIRAS';
            
            groups[group] = (groups[group] || 0) + s.amount;
        });

        return NextResponse.json({ 
            success: true, 
            totalEntries: entries.length,
            groups,
            categories: Object.values(summary).sort((a, b) => a.name.localeCompare(b.name))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}


