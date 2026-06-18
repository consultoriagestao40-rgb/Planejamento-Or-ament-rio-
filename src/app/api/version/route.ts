import { NextResponse } from 'next/server';
// Trigger v66.24 build retry

import { prisma } from '@/lib/prisma';


export async function GET() {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: 'dc2b6eed-a38a-43c3-9465-ce854bfda90f',
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: { category: true }
        });
        
        // Group by category name and ID
        const summary: Record<string, { id: string, name: string, amount: number, externalId: string | null, count: number }> = {};
        entries.forEach(e => {
            const key = `${e.categoryId}`;
            if (!summary[key]) {
                summary[key] = { id: e.categoryId, name: e.category.name, amount: 0, externalId: e.externalId, count: 0 };
            }
            summary[key].amount += e.amount;
            summary[key].count += 1;
        });

        return NextResponse.json({ success: true, summary: Object.values(summary) });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}


