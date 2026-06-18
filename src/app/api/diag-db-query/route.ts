import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const currentYear = 2026;
        const filterMode = 'active'; // active, inactive, all

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
                .replace(/^[\d. ]+-?\s*/, '')
                .replace(/\s*\(NOTURNO\)\s*/i, '')
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

        // 3. Aggregate Budgets with Logical Deduplication
        const budgetDedupMap = new Map<string, any>();
        budgets.forEach(b => {
            const cc = b.costCenterId ? (costCenterMap.get(b.costCenterId) || shortIdMap.get(b.costCenterId)) : null;
            const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
            const catName = b.category?.name || "";
            const catCode = (catName.match(/^([\d.]+)/) || [])[1] || catName;
            const dedupKey = `${catCode}-${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${b.month}-${b.tenantId}`;
            
            if (!budgetDedupMap.has(dedupKey)) {
                budgetDedupMap.set(dedupKey, b);
            } else {
                const existing = budgetDedupMap.get(dedupKey);
                const isExistingInativo = (costCenterMap.get(existing.costCenterId)?.name || '').toUpperCase().includes('[INATIVO]');
                const isCurrentInativo = (cc?.name || '').toUpperCase().includes('[INATIVO]');
                if (isExistingInativo && !isCurrentInativo) {
                    budgetDedupMap.set(dedupKey, b);
                } else if (!isExistingInativo && isCurrentInativo) {
                    // Stay with existing
                } else if ((b.amount || 0) > (existing.amount || 0)) {
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

        // 4. Aggregate Realized
        const realizedDedupMap = new Map<string, any>();
        realizedEntries.forEach(r => {
            const cc = r.costCenterId ? (costCenterMap.get(r.costCenterId) || shortIdMap.get(r.costCenterId)) : null;
            const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
            const category = categoryMap.get(r.categoryId);
            const catName = category?.name || "";
            const catCode = (catName.match(/^([\d.]+)/) || [])[1] || catName;
            const dedupKey = `${catCode}-${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${r.month}-${r.tenantId}`;
            
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

        // 5. Apply Locks
        locks.forEach(lock => {
            const cc = costCenterMap.get(lock.costCenterId) || shortIdMap.get(lock.costCenterId);
            const cleanName = getCleanName(cc?.name || '');
            const key = `${lock.tenantId}-${cleanName}`;
            
            if (summaryMap[key]) {
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

        let finalData = Object.values(summaryMap);

        // Filter out groups
        finalData = finalData.filter(item => {
            const isInactive = item.isCandidateInactive;
            const name = item.costCenterName.toUpperCase();
            if (name.includes('CLEAN TECH') || name.includes('RIO NEGRINHO') || name.includes('REDE TONIN')) {
                return false;
            }
            // Temporarily return all to inspect Penha
            return true;
        });

        return NextResponse.json({
            success: true,
            data: finalData
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
