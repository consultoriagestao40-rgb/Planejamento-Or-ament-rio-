import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const yearParam = searchParams.get('year');
        const currentYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();

        let costCenterAccessMap: Record<string, string> = {};
        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { costCenterAccess: true }
            });
            if (dbUser) {
                dbUser.costCenterAccess.forEach((c: any) => {
                    costCenterAccessMap[c.costCenterId] = c.accessLevel;
                });
            }
        }

        const anyTenant = await prisma.tenant.findFirst();

        // 1. Fetch Categories and Budgets
        const [categories, budgets, realizedEntries] = await Promise.all([
            prisma.category.findMany({
                include: { tenant: true }
            }),
            prisma.budgetEntry.findMany({
                where: { year: currentYear }
            }),
            prisma.realizedEntry.findMany({
                where: { year: currentYear }
            })
        ]);

        // --- GROUPING LOGIC ---
        const summary: any = {};

        categories.forEach(cat => {
            const catId = cat.id;
            const categoryBudgets = budgets.filter(b => b.categoryId === catId);
            const categoryRealized = realizedEntries.filter(r => r.categoryId === catId);

            const totalBudget = categoryBudgets.reduce((sum, b) => sum + (b.amount || 0), 0);
            const totalRealized = categoryRealized.reduce((sum, r) => sum + (r.amount || 0), 0);

            summary[catId] = {
                id: catId,
                name: cat.name,
                budget: totalBudget,
                realized: totalRealized,
                diff: totalBudget - totalRealized
            };
        });

        return NextResponse.json({ 
            success: true, 
            data: Object.values(summary),
            year: currentYear
        });

    } catch (error: any) {
        console.error('Failed to fetch budget summary:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
