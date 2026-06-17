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
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
        const month = parseInt(searchParams.get('month') || '6');

        // Busca todos os orçamentos do mês/ano com categoria e centro de custo
        const budgets = await prisma.budgetEntry.findMany({
            where: { year, month },
            include: { category: true, costCenter: true },
            take: 200
        });

        const realized = await prisma.realizedEntry.findMany({
            where: { year, month },
            include: { category: true, costCenter: true },
            take: 200
        });

        // Agrupa por categoria para ver valores totais
        const budgetsByCategory: Record<string, {name: string, entradaDre: string | null, type: string, total: number, entries: number, tenants: string[]}> = {};
        budgets.forEach(b => {
            const catId = b.categoryId;
            const catName = b.category?.name || 'UNKNOWN';
            const entradaDre = b.category?.entradaDre || null;
            const type = (b.category as any)?.type || 'UNKNOWN';
            if (!budgetsByCategory[catId]) {
                budgetsByCategory[catId] = { name: catName, entradaDre, type, total: 0, entries: 0, tenants: [] };
            }
            budgetsByCategory[catId].total += b.amount || 0;
            budgetsByCategory[catId].entries++;
            if (!budgetsByCategory[catId].tenants.includes(b.tenantId)) {
                budgetsByCategory[catId].tenants.push(b.tenantId);
            }
        });

        const realizedByCategory: Record<string, {name: string, entradaDre: string | null, total: number, entries: number}> = {};
        realized.forEach(r => {
            const catId = r.categoryId;
            const catName = r.category?.name || 'UNKNOWN';
            const entradaDre = r.category?.entradaDre || null;
            if (!realizedByCategory[catId]) {
                realizedByCategory[catId] = { name: catName, entradaDre, total: 0, entries: 0 };
            }
            realizedByCategory[catId].total += r.amount || 0;
            realizedByCategory[catId].entries++;
        });

        // Agrega totais por tenant
        const budgetByTenant: Record<string, number> = {};
        budgets.forEach(b => {
            if (!budgetByTenant[b.tenantId]) budgetByTenant[b.tenantId] = 0;
            budgetByTenant[b.tenantId] += b.amount || 0;
        });

        const realizedByTenant: Record<string, number> = {};
        realized.forEach(r => {
            if (!realizedByTenant[r.tenantId]) realizedByTenant[r.tenantId] = 0;
            realizedByTenant[r.tenantId] += r.amount || 0;
        });

        return NextResponse.json({
            success: true,
            year,
            month,
            summary: {
                totalBudgetEntries: budgets.length,
                totalRealizedEntries: realized.length,
                budgetTotal: budgets.reduce((s, b) => s + (b.amount || 0), 0),
                realizedTotal: realized.reduce((s, r) => s + (r.amount || 0), 0),
            },
            budgetByTenant,
            realizedByTenant,
            budgetsByCategory: Object.values(budgetsByCategory).sort((a, b) => b.total - a.total).slice(0, 30),
            realizedByCategory: Object.values(realizedByCategory).sort((a, b) => b.total - a.total).slice(0, 30),
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
