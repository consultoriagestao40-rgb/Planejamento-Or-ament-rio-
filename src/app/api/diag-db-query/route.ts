import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const jvsId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const spotId = '413f88a7-ce4a-4620-b044-43ef909b7b26';
        
        const categories = await prisma.category.findMany({
            where: {
                tenantId: { in: [jvsId, spotId] }
            }
        });
        
        return NextResponse.json({
            success: true,
            count: categories.length,
            categories: categories.map(c => ({
                id: c.id,
                name: c.name,
                tenantId: c.tenantId,
                parentId: c.parentId,
                entradaDre: c.entradaDre
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
