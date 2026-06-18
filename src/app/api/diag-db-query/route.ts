import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: {
                amount: 1760.16
            },
            include: { category: true, tenant: true }
        });
        
        return NextResponse.json({
            success: true,
            totalJvsEntries: entries.length,
            jvsEntries: entries.map(e => ({
                id: e.id,
                amount: e.amount,
                description: e.description,
                categoryName: e.category.name,
                categoryId: e.categoryId,
                tenantName: e.tenant.name,
                month: e.month,
                year: e.year,
                viewMode: e.viewMode
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
