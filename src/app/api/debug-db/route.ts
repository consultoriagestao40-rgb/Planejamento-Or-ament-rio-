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
            'MRV - LOJA SENSIA MARINGA'
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
            const matchedCcs = await prisma.costCenter.findMany({
                where: {
                    OR: [
                        { name: { contains: name } },
                        { name: { contains: name.replace('MRV - ', '') } }
                    ]
                }
            });

            const filteredCcs = matchedCcs.filter(cc => normalize(cc.name) === norm);
            const ccIds = filteredCcs.map(cc => cc.id);

            // Check budgets across ALL years
            const budgets = await prisma.budgetEntry.groupBy({
                by: ['year'],
                where: { costCenterId: { in: ccIds } },
                _count: true,
                _sum: { amount: true }
            });

            results.push({
                name,
                ccIdsFound: ccIds,
                ccNamesFound: filteredCcs.map(c => c.name),
                budgetsByYear: budgets.map(b => ({
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
