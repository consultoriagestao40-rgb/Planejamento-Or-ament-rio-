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
                month: 5,
                viewMode: 'competencia'
            },
            include: { category: true }
        });
        
        return NextResponse.json({
            success: true,
            count: entries.length,
            entries: entries.map(e => ({
                id: e.id,
                amount: e.amount,
                description: e.description,
                categoryName: e.category.name,
                categoryId: e.categoryId,
                costCenterId: e.costCenterId
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
