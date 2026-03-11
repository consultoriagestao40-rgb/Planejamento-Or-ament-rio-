import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                year: 2026,
                month: 0,
                viewMode: 'competencia',
                category: { name: { startsWith: '01' } }
            },
            include: { category: true, costCenter: true },
            orderBy: { amount: 'desc' }
        });

        const total = entries.reduce((acc, curr) => acc + curr.amount, 0);

        return NextResponse.json({
            success: true,
            total,
            count: entries.length,
            entries: entries.map(e => ({
                id: e.id,
                cat: e.category.name,
                cc: e.costCenter?.name || 'Geral',
                amount: e.amount,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
