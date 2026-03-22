import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const targetNames = [
            'MRV - LOJA BRASIL',
            'MRV - LOJA JOHN KENNEDY',
            'MRV - LOJA SENSIA CURITIBA'
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
            
            // Search ALL CCs in the WHOLE system matching this name
            const allMatchedCcs = await prisma.costCenter.findMany({
                where: {
                    OR: [
                        { name: { contains: name, mode: 'insensitive' } },
                        { name: { contains: name.replace('MRV - ', ''), mode: 'insensitive' } }
                    ]
                },
                include: { tenant: { select: { name: true } } }
            });

            const filteredCcs = allMatchedCcs.filter(cc => normalize(cc.name) === norm);
            const ccIds = filteredCcs.map(cc => cc.id);

            const budgets = await prisma.budgetEntry.groupBy({
                by: ['tenantId', 'year'],
                where: { costCenterId: { in: ccIds } },
                _count: true,
                _sum: { amount: true }
            });

            results.push({
                name,
                systemWideCcsFound: filteredCcs.map(c => ({ name: c.name, tenant: c.tenant.name })),
                budgetsFound: budgets.map(b => ({
                    tenantId: b.tenantId,
                    year: b.year,
                    count: b._count,
                    total: b._sum.amount
                }))
            });
        }

        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
