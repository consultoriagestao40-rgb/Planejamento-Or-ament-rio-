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
        const filterMode = searchParams.get('filterMode') || 'active'; // active, inactive, all

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
                .replace(/^[\d. ]+-?\s*/, '') // Remove prefixos numéricos "271.204 - "
                .replace(/\s*\(NOTURNO\)\s*/i, '') // Remove sufixos de turno para agrupamento
                .replace(/\s*\(DIURNO\)\s*/i, '')
                .trim();
        };

        const costCenterMap = new Map(costCenters.map(cc => [cc.id, cc]));
        const shortIdMap = new Map();
        costCenters.forEach(cc => {
            if (cc.id.includes(':')) {
                shortIdMap.set(cc.id.split(':').pop()!, cc);
            }
        });

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

        // 3. Aggregate Budgets with Logical Deduplication (Mirroring /api/budgets/route.ts)
        const budgetDedupMap = new Map<string, any>();
        budgets.forEach(b => {
            const cc = b.costCenterId ? (costCenterMap.get(b.costCenterId) || shortIdMap.get(b.costCenterId)) : null;
            const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
            // Unique key: Logic matches the Grid (Category + Normalized Name + Month + Tenant)
            const dedupKey = `${b.categoryId}-${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${b.month}-${b.tenantId}`;
            
            if (!budgetDedupMap.has(dedupKey)) {
                budgetDedupMap.set(dedupKey, b);
            } else {
                const existing = budgetDedupMap.get(dedupKey);
                // Priority: Keep [ATIVO] over [INATIVO] if they clash for the same logical month
                const isExistingInativo = (costCenterMap.get(existing.costCenterId)?.name || '').toUpperCase().includes('[INATIVO]');
                const isCurrentInativo = (cc?.name || '').toUpperCase().includes('[INATIVO]');
                if (isExistingInativo && !isCurrentInativo) {
                    budgetDedupMap.set(dedupKey, b);
                } else if (!isExistingInativo && isCurrentInativo) {
                    // Stay with existing
                } else if ((b.amount || 0) > (existing.amount || 0)) {
                    // Tie-breaker: keep larger amount
                    budgetDedupMap.set(dedupKey, b);
                }
            }
        });

        Array.from(budgetDedupMap.values()).forEach(b => {
            let key;
            const cc = b.costCenterId ? (costCenterMap.get(b.costCenterId) || shortIdMap.get(b.costCenterId)) : null;

            if (!cc) {
                key = `${b.tenantId}-DEFAULT`;
            } else {
                const cleanName = getCleanName(cc.name);
                key = `${cc.tenantId}-${cleanName}`;
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

        // 4. Aggregate Realized with similar Deduplication for consistency
        const realizedDedupMap = new Map<string, any>();
        realizedEntries.forEach(r => {
            const cc = r.costCenterId ? (costCenterMap.get(r.costCenterId) || shortIdMap.get(r.costCenterId)) : null;
            const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
            const dedupKey = `${r.categoryId}-${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${r.month}-${r.tenantId}`;
            
            if (!realizedDedupMap.has(dedupKey)) {
                realizedDedupMap.set(dedupKey, r);
            } else {
                const existing = realizedDedupMap.get(dedupKey);
                const isExistingInativo = (costCenterMap.get(existing.costCenterId)?.name || '').toUpperCase().includes('[INATIVO]');
                const isCurrentInativo = (cc?.name || '').toUpperCase().includes('[INATIVO]');
                if (isExistingInativo && !isCurrentInativo) {
                    realizedDedupMap.set(dedupKey, r);
                } else if ((r.amount || 0) > (existing.amount || 0)) {
                    realizedDedupMap.set(dedupKey, r);
                }
            }
        });

        Array.from(realizedDedupMap.values()).forEach(r => {
            let key;
            const cc = r.costCenterId ? (costCenterMap.get(r.costCenterId) || shortIdMap.get(r.costCenterId)) : null;

            if (!cc) {
                key = `${r.tenantId}-DEFAULT`;
            } else {
                const cleanName = getCleanName(cc.name);
                key = `${cc.tenantId}-${cleanName}`;
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
            const cc = costCenterMap.get(lock.costCenterId) || shortIdMap.get(lock.costCenterId);
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

        // 6. Security & Data Filter
        let finalData = Object.values(summaryMap);

        // Filter out groups that are PURELY Inactive (all original members have [INATIVO] ou ENCERRADO)
        // AND handle specific user requests for Clean Tech, Rio Negrinho and REDE TONIN
        finalData = finalData.filter(item => {
            const isInactive = item.isCandidateInactive;
            const name = item.costCenterName.toUpperCase();
            
            // Specific hide requests (partial matches for safety)
            if (name.includes('CLEAN TECH') || name.includes('RIO NEGRINHO') || name.includes('REDE TONIN')) {
                return false;
            }

            // General rules via Dashboard Filter Mode:
            if (filterMode === 'active' && isInactive) return false;
            if (filterMode === 'inactive' && !isInactive) return false;
            // if 'all', we let everything through
            
            return true;
        });

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
