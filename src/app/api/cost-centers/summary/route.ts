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
        
        // --- NORMALIZATION HELPER ---
        const getCleanName = (name: string) => {
            return (name || '')
                .replace(/^\[INATIVO\]\s*/i, '')
                .replace(/^ENCERRADO\s*/i, '')
                .replace(/^\[inativo\]\s*/i, '')
                .replace(/^encerrado\s*/i, '')
                .trim();
        };

        const costCenterMap = new Map(costCenters.map(cc => [cc.id, cc]));

        // 2. Initialize Summary Map
        const summaryMap: Record<string, any> = {};

        // Initialize unique groups by (Tenant + Clean Name)
        costCenters.forEach(cc => {
            const cleanName = getCleanName(cc.name);
            const key = `${cc.tenantId}-${cleanName}`;
            
            // If the group doesn't exist, Create it
            // If it exists but the NEW CC name does NOT have [INATIVO], it's the primary CC for ID links
            const isInactive = (cc.name || '').toUpperCase().includes('[INATIVO]');
            
            if (!summaryMap[key] || (!isInactive && summaryMap[key].isCandidateInactive)) {
                summaryMap[key] = {
                    tenantId: cc.tenantId,
                    tenantName: cc.tenant.name,
                    costCenterId: cc.id, // Primary ID for links
                    costCenterName: cleanName,
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
                    currentUserAccessLevel: 'EDITAR',
                    isCandidateInactive: isInactive
                };
            }
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
                currentUserAccessLevel: 'EDITAR',
                isCandidateInactive: false
            };
        });

        // 3. Aggregate Budgets
        budgets.forEach(b => {
            let key;
            if (!b.costCenterId) {
                key = `${b.tenantId}-DEFAULT`;
            } else {
                const cc = costCenterMap.get(b.costCenterId);
                const cleanName = getCleanName(cc?.name || '');
                key = `${b.tenantId}-${cleanName}`;
            }

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
            let key;
            if (!r.costCenterId) {
                key = `${r.tenantId}-DEFAULT`;
            } else {
                const cc = costCenterMap.get(r.costCenterId);
                const cleanName = getCleanName(cc?.name || '');
                key = `${r.tenantId}-${cleanName}`;
            }

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

        // 5. Apply Locks and Approval Status (based on ANY of the IDs in the name group? usually 1:1)
        locks.forEach(lock => {
            const cc = costCenterMap.get(lock.costCenterId);
            const cleanName = getCleanName(cc?.name || '');
            const key = `${lock.tenantId}-${cleanName}`;
            
            if (summaryMap[key]) {
                // If the lock belongs to the primary CC or the group hasn't been locked yet, show it
                summaryMap[key].isLocked = summaryMap[key].isLocked || lock.isLocked;
                if (lock.status === 'APPROVED' || summaryMap[key].status === 'PENDING') {
                    summaryMap[key].status = lock.status;
                    summaryMap[key].n1ApprovedBy = lock.n1ApprovedBy;
                    summaryMap[key].n1ApprovedAt = lock.n1ApprovedAt;
                    summaryMap[key].n2ApprovedBy = lock.n2ApprovedBy;
                    summaryMap[key].n2ApprovedAt = lock.n2ApprovedAt;
                }
            }
        });

        // 6. Security Filter
        let finalData = Object.values(summaryMap);
        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { costCenterAccess: true }
            });
            if (dbUser) {
                const allowedCleanNames = new Set();
                dbUser.costCenterAccess.forEach(a => {
                    const cc = costCenterMap.get(a.costCenterId);
                    allowedCleanNames.add(getCleanName(cc?.name || ''));
                });

                finalData = finalData.filter(item => 
                    item.costCenterId === 'DEFAULT' || allowedCleanNames.has(getCleanName(item.costCenterName))
                );
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
