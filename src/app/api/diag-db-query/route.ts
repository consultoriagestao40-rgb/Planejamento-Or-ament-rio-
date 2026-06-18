import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: {
                OR: [
                    { description: { contains: 'sefaz', mode: 'insensitive' } },
                    { categoryId: { contains: '514d81fe-c366-4714-8243-39bbb4bc9e55' } },
                    { categoryId: { contains: '5405d46e-a1f0-45cf-a30c-634d13d7a28b' } }
                ]
            },
            include: { category: true, tenant: true }
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
