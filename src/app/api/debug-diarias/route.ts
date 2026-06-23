import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const categories = await prisma.category.findMany({
            where: {
                OR: [
                    { name: { contains: 'diária', mode: 'insensitive' } },
                    { name: { contains: 'diaria', mode: 'insensitive' } }
                ]
            }
        });

        const categoryIds = categories.map(c => c.id);
        const realized = await prisma.realizedEntry.findMany({
            where: {
                year: 2026,
                month: 1,
                categoryId: { in: categoryIds }
            },
            include: { category: true }
        });

        const budgets = await prisma.budgetEntry.findMany({
            where: {
                year: 2026,
                month: 1,
                categoryId: { in: categoryIds }
            },
            include: { category: true }
        });

        return NextResponse.json({
            success: true,
            tenants,
            categories,
            realized,
            budgets
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
