import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const categories = await prisma.category.findMany({
            where: {
                OR: [
                    { id: { contains: ':02.01' } },
                    { name: { contains: '02.01' } },
                    { name: { contains: 'Tributos' } },
                    { name: { contains: 'Impostos' } }
                ]
            },
            take: 50
        });

        return NextResponse.json({ 
            success: true, 
            categories: categories.map(c => ({
                id: c.id,
                name: c.name,
                parentId: c.parentId,
                tenantId: c.tenantId,
                entradaDre: c.entradaDre
            }))
        });

    } catch (error: any) {
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
