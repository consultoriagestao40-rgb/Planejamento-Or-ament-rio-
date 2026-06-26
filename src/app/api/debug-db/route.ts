import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'refresh-token') {
            const { token, tenant } = await getValidAccessToken('dc2b6eed-a38a-43c3-9465-ce854bfda90f');
            return NextResponse.json({ success: true, token, tenant });
        }

        if (action === 'test-summary') {
            const currentYear = 2026;
            const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';

            const [tenants, costCenters, categories, budgets, realizedEntries] = await Promise.all([
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
                })
            ]);

            const getCleanName = (name: string) => {
                const clean = (name || '')
                    .replace(/^\[INATIVO\]\s*/i, '')
                    .replace(/^ENCERRADO\s*/i, '')
                    .replace(/^[\d. ]+-?\s*/, '')
                    .replace(/\s*\(NOTURNO\)\s*/i, '')
                    .replace(/\s*\(DIURNO\)\s*/i, '')
                    .trim();
                const upper = clean.toUpperCase();
                if (upper.includes('ERASTO') || upper.includes('GAETNER') || upper.includes('GAERTNER')) {
                    return 'ERASTO GAETNER';
                }
                return clean;
            };

            const summaryMap: Record<string, any> = {};

            costCenters.forEach(cc => {
                const cleanName = getCleanName(cc.name);
                const key = `${cc.tenantId}-${cleanName}`;
                const isInactive = (cc.name || '').toUpperCase().includes('[INATIVO]');
                
                if (!summaryMap[key] || (!isInactive && summaryMap[key].isCandidateInactive)) {
                    summaryMap[key] = {
                        tenantId: cc.tenantId,
                        tenantName: cc.tenant.name,
                        costCenterId: cc.id,
                        costCenterName: cleanName === 'ERASTO GAETNER' ? 'ERASTO GAETNER' : cc.name,
                        totalRevenueBudget: 0,
                        totalExpenseBudget: 0,
                        totalRevenue: 0,
                        totalExpense: 0,
                        hasBudgetData: false,
                        hasRealizedData: false,
                        isCandidateInactive: isInactive
                    };
                }
            });

            // Group Budgets
            budgets.forEach(b => {
                const cc = b.costCenterId ? (costCenters.find(c => c.id === b.costCenterId || (c.id.includes(':') && c.id.split(':').pop() === b.costCenterId))) : null;
                const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
                const key = cc ? `${cc.tenantId}-${cleanName}` : `${b.tenantId}-DEFAULT`;
                if (summaryMap[key]) {
                    summaryMap[key].hasBudgetData = true;
                    summaryMap[key].totalExpenseBudget += b.amount;
                }
            });

            // Group Realized
            realizedEntries.forEach(r => {
                const cc = r.costCenterId ? (costCenters.find(c => c.id === r.costCenterId || (c.id.includes(':') && c.id.split(':').pop() === r.costCenterId))) : null;
                const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
                const key = cc ? `${cc.tenantId}-${cleanName}` : `${r.tenantId}-DEFAULT`;
                if (summaryMap[key]) {
                    summaryMap[key].hasRealizedData = true;
                    summaryMap[key].totalExpense += r.amount;
                }
            });

            const finalData = Object.values(summaryMap).filter(item => item.tenantId === tenantId);
            const erastoGroup = finalData.find(item => item.costCenterName === 'ERASTO GAETNER');

            return NextResponse.json({
                success: true,
                totalGroups: finalData.length,
                allGroupNames: finalData.map(i => i.costCenterName),
                erastoGroup
            });
        }

        if (action === 'query-sql') {
            const sql = searchParams.get('sql');
            if (!sql) {
                return NextResponse.json({ success: false, error: 'SQL query missing' });
            }
            const result = await prisma.$queryRawUnsafe(sql);
            return NextResponse.json({ success: true, result });
        }
        const sessions = await prisma.chatSession.findMany({
            where: { title: 'DEBUG_SESSION' },
            include: {
                user: { select: { email: true, role: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 20
                }
            }
        });

        const jvsTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const jvsAccesses = await prisma.userCostCenterAccess.findMany({
            where: { costCenter: { tenantId: jvsTenantId } },
            include: {
                user: { select: { email: true } },
                costCenter: true
            }
        });

        return NextResponse.json({
            success: true,
            sessions: sessions.map(s => ({
                userEmail: s.user.email,
                userRole: s.user.role,
                messages: s.messages.map(m => {
                    try {
                        return JSON.parse(m.content);
                    } catch (e) {
                        return m.content;
                    }
                })
            })),
            jvsAccesses: jvsAccesses.map(a => ({
                userEmail: a.user.email,
                ccName: a.costCenter.name,
                ccId: a.costCenterId
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
