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
            include: { category: true }
        });
        
        // Find if any entry contains amount 1760.16
        const sefazEntries = jvsEntries.filter(e => Math.abs(e.amount - 1760.16) < 0.01 || e.description?.toLowerCase().includes('sefaz') || e.category.name.toLowerCase().includes('sefaz'));
        
        return NextResponse.json({
            success: true,
            totalJvsEntries: jvsEntries.length,
            sefazEntries,
            jvsEntries: jvsEntries.map(e => ({
                id: e.id,
                amount: e.amount,
                description: e.description,
                categoryName: e.category.name,
                costCenterId: e.costCenterId
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
