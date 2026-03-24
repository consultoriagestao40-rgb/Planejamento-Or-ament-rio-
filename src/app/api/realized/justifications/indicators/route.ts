import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantIdParam = searchParams.get('tenantId') || 'ALL';
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
        const viewMode = searchParams.get('viewMode') || 'competencia';

        let tenantIds: string[] = [];
        if (tenantIdParam === 'ALL') {
             const tenants = await prisma.tenant.findMany({ select: { id: true } });
             tenantIds = tenants.map(t => t.id);
        } else {
             tenantIds = tenantIdParam.split(',').filter(Boolean);
        }

        const justifications = await (prisma as any).realizedJustification.findMany({
            where: {
                tenantId: { in: tenantIds },
                year,
                viewMode
            },
            select: {
                categoryId: true,
                month: true
            }
        });

        const categories = await prisma.category.findMany({
            where: { tenantId: { in: tenantIds } },
            select: { id: true, parentId: true }
        });
        const categoryMap: Record<string, string | null> = {};
        categories.forEach(c => { categoryMap[c.id] = c.parentId; });

        const indicators: Record<string, boolean> = {};
        
        justifications.forEach((j: any) => {
            let currentId: string | null = j.categoryId;
            while (currentId) {
                indicators[`${currentId}-${j.month - 1}`] = true;
                currentId = categoryMap[currentId] || null;
            }
        });

        return NextResponse.json({ success: true, indicators });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
