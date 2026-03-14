
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name') || '';
        
        const tenants = await prisma.tenant.findMany({
            where: { name: { contains: name, mode: 'insensitive' } },
            include: {
                realized: {
                    where: { year: 2026, viewMode: 'caixa' },
                    include: { category: true }
                }
            }
        });

        const audit = tenants.map(t => {
            const categories = new Map();
            t.realized.forEach(r => {
                const catName = r.category.name;
                categories.set(catName, (categories.get(catName) || 0) + r.amount);
            });
            return {
                tenant: t.name,
                total: t.realized.reduce((acc, r) => acc + r.amount, 0),
                breakdown: Object.fromEntries(categories)
            };
        });

        return NextResponse.json({ success: true, audit });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
