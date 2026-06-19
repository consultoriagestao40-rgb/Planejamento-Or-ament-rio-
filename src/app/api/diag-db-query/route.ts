import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Clean Tech Tenant not found' });
        }

        const categories = await prisma.category.findMany({
            where: {
                tenantId: tenant.id
            },
            orderBy: {
                name: 'asc'
            }
        });

        const detailedCategories = categories.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            entradaDre: c.entradaDre
        }));

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            detailedCategories,
            totalCount: categories.length
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
