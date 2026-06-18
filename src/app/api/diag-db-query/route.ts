import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const categories = await prisma.category.findMany({
            where: { tenantId }
        });
        
        return NextResponse.json({
            success: true,
            count: categories.length,
            categories: categories.map(c => ({
                id: c.id,
                name: c.name,
                parentId: c.parentId,
                entradaDre: c.entradaDre
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
