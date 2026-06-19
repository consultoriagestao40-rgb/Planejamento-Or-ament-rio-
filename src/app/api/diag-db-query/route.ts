import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const cleanTech = tenants.find(t => t.name.toUpperCase().includes('CLEAN TECH'));
        if (!cleanTech) {
            return NextResponse.json({ success: false, error: 'Clean Tech not found' });
        }

        // Get both competencia and caixa entries
        const allEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: cleanTech.id,
                year: 2026,
                month: 5
            },
            include: {
                category: true
            }
        });

        const groupTotals = (entries: any[]) => {
            const totals: Record<string, number> = {
                '01. RECEITA BRUTA': 0,
                '02. TRIBUTO SOBRE FATURAMENTO': 0,
                '03. CUSTO OPERACIONAL': 0,
                '04. DESPESA OPERACIONAL': 0,
                '05. DESPESAS ADMINISTRATIVAS': 0,
                '06. DESPESAS FINANCEIRAS': 0
            };

            entries.forEach(e => {
                const name = e.category.name;
                let group = 'None';
                if (name.startsWith('01') || name.startsWith('1.')) group = '01. RECEITA BRUTA';
                else if (name.startsWith('02') || name.startsWith('2.')) group = '02. TRIBUTO SOBRE FATURAMENTO';
                else if (name.startsWith('03') || name.startsWith('3.')) group = '03. CUSTO OPERACIONAL';
                else if (name.startsWith('04') || name.startsWith('4.')) group = '04. DESPESA OPERACIONAL';
                else if (name.startsWith('05') || name.startsWith('5.')) group = '05. DESPESAS ADMINISTRATIVAS';
                else if (name.startsWith('06') || name.startsWith('6.')) group = '06. DESPESAS FINANCEIRAS';

                if (totals[group] !== undefined) {
                    totals[group] += e.amount;
                }
            });
            return totals;
        };

        const compEntries = allEntries.filter(e => e.viewMode === 'competencia');
        const caixaEntries = allEntries.filter(e => e.viewMode === 'caixa');

        // Detail of individual categories in group 06 for comparison
        const getFinDetail = (entries: any[]) => {
            return entries
                .filter(e => e.category.name.startsWith('06') || e.category.name.startsWith('6'))
                .map(e => ({
                    category: e.category.name,
                    amount: e.amount,
                    description: e.description
                }));
        };

        return NextResponse.json({
            success: true,
            cleanTech: {
                id: cleanTech.id,
                name: cleanTech.name
            },
            competencia: {
                totals: groupTotals(compEntries),
                finDetail: getFinDetail(compEntries)
            },
            caixa: {
                totals: groupTotals(caixaEntries),
                finDetail: getFinDetail(caixaEntries)
            }
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
