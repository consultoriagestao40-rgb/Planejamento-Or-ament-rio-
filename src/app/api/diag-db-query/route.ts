import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const jvsEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: 'dc2b6eed-a38a-43c3-9465-ce854bfda90f',
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: { category: true },
            orderBy: { amount: 'desc' }
        });
        
        return NextResponse.json({
            success: true,
            totalJvsEntries: jvsEntries.length,
            jvsEntries: jvsEntries.map(e => ({
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
