import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const targetNames = [
            'MRV - LOJA BRASIL',
            'MRV - LOJA JOHN KENNEDY',
            'MRV - LOJA SENSIA CURITIBA',
            'MRV - LOJA SENSIA LONDRINA',
            'MRV - LOJA SENSIA MARINGA',
            'MRV - PL VENDAS FATEC'
        ];

        const normalize = (name: string) => 
            (name || '').toLowerCase()
                .replace(/^\[inativo\]\s*/i, '')
                .replace(/^encerrado\s*/i, '')
                .replace(/[^a-z0-9]/g, '')
                .trim();

        const results: any[] = [];

        for (const name of targetNames) {
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
                const totalDirect = directBudget.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
                
                let synonymsWithBudgets: string[] = [];
                if (totalDirect === 0 && budgets.length > 0) {
                    const mappedBudgets = budgets.filter(b => b.costCenterId);
                    const otherCcIds = Array.from(new Set(mappedBudgets.map(b => b.costCenterId).filter(id => id && !ccIds.includes(id))));
                    
                    if (otherCcIds.length > 0) {
                        const otherCcs = await prisma.costCenter.findMany({
                            where: { id: { in: otherCcIds as string[] } },
                            select: { id: true, name: true }
                        });
                        synonymsWithBudgets = otherCcs
                            .filter(cc => normalize(cc.name) === norm)
                            .map(cc => cc.name);
                    }
                }

                results.push({
                    name,
                    norm,
                    foundCcs: matchedCcs.map(cc => cc.name),
                    directBudgetCount: directBudget.length,
                    totalDirectAmount: totalDirect,
                    tenantBudgetsTotalCount: budgets.length,
                    synonymsWithBudgets
                });
            } else {
                results.push({ name, norm, status: 'NOT_FOUND' });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
