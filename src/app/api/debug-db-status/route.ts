import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [tenants, categories, budgets, realized] = await Promise.all([
            prisma.tenant.count(),
            prisma.category.count(),
            prisma.budgetEntry.count(),
            prisma.realizedEntry.count()
        ]);

        const sampleCategories = await prisma.category.findMany({ take: 5 });
        const sampleTenants = await prisma.tenant.findMany({ take: 5 });

        return NextResponse.json({
            success: true,
            counts: {
                tenants,
                categories,
                budgets,
                realized
            },
            samples: {
                categories: sampleCategories.map(c => ({ id: c.id, name: c.name, tenantId: c.tenantId })),
                tenants: sampleTenants.map(t => ({ id: t.id, name: t.name }))
            }
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
