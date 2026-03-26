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

        // 1. Fetch Basic Data
        const [tenants, costCenters, categories, budgets, realizedEntries, locks] = await Promise.all([
            prisma.tenant.findMany(),
            prisma.costCenter.findMany({ include: { tenant: true } }),
            prisma.category.findMany(),
            prisma.budgetEntry.findMany({ 
                where: { year: currentYear },
                include: { category: true }
            }),
            prisma.realizedEntry.findMany({ 
                where: { year: currentYear },
                include: { category: true }
            }),
            prisma.costCenterLock.findMany({
                where: { year: currentYear }
            })
        ]);

        const tenantMap = new Map(tenants.map(t => [t.id, t]));
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        
        // 2. Initialize Summary Map
        const summaryMap: Record<string, any> = {};

        // Initialize with ALL Cost Centers (we will filter later)
        costCenters.forEach(cc => {
            const key = `${cc.tenantId}-${cc.id}`;
            summaryMap[key] = {
                tenantId: cc.tenantId,
                tenantName: cc.tenant.name,
                costCenterId: cc.id,
                costCenterName: cc.name,
                totalRevenueBudget: 0,
                totalExpenseBudget: 0,
                totalRevenue: 0,
                totalExpense: 0,
                hasBudgetData: false,
                hasRealizedData: false,
                isLocked: false,
                status: 'PENDING',
                taxRate: cc.tenant.taxRate || 0,
                n1ApprovedBy: null,
                n1ApprovedAt: null,
                n2ApprovedBy: null,
                n2ApprovedAt: null,
                currentUserAccessLevel: 'EDITAR'
            };
        });

        // Initialize "GENERAL" items for each tenant
        tenants.forEach(t => {
            const key = `${t.id}-DEFAULT`;
            summaryMap[key] = {
                tenantId: t.id,
                tenantName: t.name,
                costCenterId: 'DEFAULT',
                costCenterName: 'GERAL (Sem Centro de Custo)',
                totalRevenueBudget: 0,
                totalExpenseBudget: 0,
                totalRevenue: 0,
                totalExpense: 0,
                hasBudgetData: false,
                hasRealizedData: false,
                isLocked: false,
                status: 'APPROVED',
                taxRate: t.taxRate || 0,
                n1ApprovedBy: null,
                n1ApprovedAt: null,
                n2ApprovedBy: null,
                n2ApprovedAt: null,
                currentUserAccessLevel: 'EDITAR'
            };
        });

        // 3. Aggregate Budgets
        budgets.forEach(b => {
            const key = `${b.tenantId}-${b.costCenterId || 'DEFAULT'}`;
            if (!summaryMap[key]) return;

            const category = categoryMap.get(b.categoryId);
            if (!category) return;

            const type = (category.type || '').toUpperCase();
            if (type === 'REVENUE' || type === 'RECEITA') {
                summaryMap[key].totalRevenueBudget += b.amount;
            } else {
                summaryMap[key].totalExpenseBudget += b.amount;
            }
            summaryMap[key].hasBudgetData = true;
        });

        // 4. Aggregate Realized
        realizedEntries.forEach(r => {
            const key = `${r.tenantId}-${r.costCenterId || 'DEFAULT'}`;
            if (!summaryMap[key]) return;

            const category = categoryMap.get(r.categoryId);
            if (!category) return;

            const type = (category.type || '').toUpperCase();
            if (type === 'REVENUE' || type === 'RECEITA') {
                summaryMap[key].totalRevenue += r.amount;
            } else {
                summaryMap[key].totalExpense += r.amount;
            }
            summaryMap[key].hasRealizedData = true;
        });

        // 5. Apply Locks and Approval Status
        locks.forEach(lock => {
            const key = `${lock.tenantId}-${lock.costCenterId}`;
            if (summaryMap[key]) {
                summaryMap[key].isLocked = lock.isLocked;
                summaryMap[key].status = lock.status;
                summaryMap[key].n1ApprovedBy = lock.n1ApprovedBy;
                summaryMap[key].n1ApprovedAt = lock.n1ApprovedAt;
                summaryMap[key].n2ApprovedBy = lock.n2ApprovedBy;
                summaryMap[key].n2ApprovedAt = lock.n2ApprovedAt;
            }
        });

        // 6. Security & Data Filter
        let finalData = Object.values(summaryMap);

        // Filter out Inactive entries ONLY if they have NO DATA
        finalData = finalData.filter(item => {
            const isInactive = item.costCenterName.includes('[INATIVO]');
            const hasData = item.totalRevenueBudget !== 0 || item.totalExpenseBudget !== 0 || item.totalRevenue !== 0 || item.totalExpense !== 0;
            
            if (isInactive && !hasData) return false;
            return true;
        });

        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { costCenterAccess: true }
            });
            if (dbUser) {
                const allowedIds = new Set(dbUser.costCenterAccess.map(a => a.costCenterId));
                finalData = finalData.filter(item => 
                    item.costCenterId === 'DEFAULT' || allowedIds.has(item.costCenterId)
                ).map(item => {
                    const access = dbUser.costCenterAccess.find(a => a.costCenterId === item.costCenterId);
                    return {
                        ...item,
                        currentUserAccessLevel: access ? access.accessLevel : 'LEITOR'
                    };
                });
            }
        }

        return NextResponse.json({ 
            success: true, 
            data: finalData,
            year: currentYear
        });

    } catch (error: any) {
        console.error('Failed to fetch budget summary:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
