import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [categories, costCenters] = await Promise.all([
            prisma.category.findMany({
                orderBy: { name: 'asc' }
            }),
            prisma.costCenter.findMany({
                orderBy: { name: 'asc' }
            })
        ]);

        return NextResponse.json({
            success: true,
            categories: categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                parentId: cat.parentId,
                type: cat.type,
                entradaDre: (cat as any).entradaDre || null
            })),
            costCenters: costCenters.map(cc => ({
                id: cc.id,
                name: cc.name
            }))
        });
    } catch (error: any) {
        console.error('Setup fetch failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
