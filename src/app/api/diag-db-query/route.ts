import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const jvsTrat = tenants.find(t => t.name.toUpperCase().includes('TRATMENTOS') || t.name.toUpperCase().includes('TRATAMENTOS'));
        
        let contractsOutput: any = {};

        if (jvsTrat) {
            const targetTenantIds = [jvsTrat.id];
            const year = 2026;
            const startMonth = 0;
            const endMonth = 11;
            const viewMode = 'competencia';

            const isRevenueCategory = (name: string) => {
                const cleanCode = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                return cleanCode.startsWith('01') || cleanCode === '1';
            };

            const categories = await prisma.category.findMany({
                where: { tenantId: { in: targetTenantIds } },
                select: { id: true, name: true }
            });
            const revenueCategoryIds = categories
                .filter(c => isRevenueCategory(c.name))
                .map(c => c.id);

            const [realizedRaw, realizedAnnualRaw, budgetRaw] = await Promise.all([
                prisma.realizedEntry.findMany({
                    where: {
                        tenantId: { in: targetTenantIds },
                        categoryId: { in: revenueCategoryIds },
                        year,
                        month: { gte: startMonth + 1, lte: endMonth + 1 },
                        viewMode
                    }
                }),
                prisma.realizedEntry.findMany({
                    where: {
                        tenantId: { in: targetTenantIds },
                        categoryId: { in: revenueCategoryIds },
                        year,
                        viewMode
                    }
                }),
                prisma.budgetEntry.findMany({
                    where: {
                        tenantId: { in: targetTenantIds },
                        categoryId: { in: revenueCategoryIds },
                        year,
                        month: { gte: startMonth + 1, lte: endMonth + 1 }
                    }
                })
            ]);

            const syncedMonths = new Set<string>();
            realizedRaw.forEach(e => {
                if (e.externalId && e.externalId.startsWith('sync-')) {
                    syncedMonths.add(`${e.year}|${e.month}`);
                }
            });

            const realizedEntries = realizedRaw.filter(e => {
                const key = `${e.year}|${e.month}`;
                if (syncedMonths.has(key)) {
                    return e.externalId && e.externalId.startsWith('sync-');
                }
                return true;
            });

            const syncedAnnualMonths = new Set<string>();
            realizedAnnualRaw.forEach(e => {
                if (e.externalId && e.externalId.startsWith('sync-')) {
                    syncedAnnualMonths.add(`${e.year}|${e.month}`);
                }
            });

            const realizedAnnualEntries = realizedAnnualRaw.filter(e => {
                const key = `${e.year}|${e.month}`;
                if (syncedAnnualMonths.has(key)) {
                    return e.externalId && e.externalId.startsWith('sync-');
                }
                return true;
            });

            let totalBudget = budgetRaw.reduce((sum, b) => sum + b.amount, 0);
            let totalRealized = realizedEntries.reduce((sum, r) => sum + r.amount, 0);
            let totalAnnualRealized = realizedAnnualEntries.reduce((sum, r) => sum + r.amount, 0);

            const customerMap = new Map<string, { total: number; monthly: Record<number, number> }>();

            const normalizeCustomerName = (name: string): string => {
                return (name || 'Sem Cliente/Outros')
                    .replace(/^\[INATIVO\]\s*/i, '')
                    .replace(/^ENCERRADO\s*/i, '')
                    .trim();
            };

            realizedEntries.forEach(r => {
                const customerName = normalizeCustomerName(r.customer || r.description || 'Sem Cliente/Outros');
                const monthIdx = r.month - 1; // 0-indexed month
                
                if (!customerMap.has(customerName)) {
                    customerMap.set(customerName, { total: 0, monthly: {} });
                }
                
                const data = customerMap.get(customerName)!;
                data.total += r.amount;
                data.monthly[monthIdx] = (data.monthly[monthIdx] || 0) + r.amount;
            });

            const contracts = Array.from(customerMap.entries())
                .map(([name, data]) => {
                    const totalInThousands = data.total / 1000;
                    const percentageOfBudget = totalBudget > 0 ? (data.total / totalBudget) * 100 : 0;
                    
                    const monthlyInThousands: Record<number, number> = {};
                    Object.entries(data.monthly).forEach(([m, val]) => {
                        monthlyInThousands[parseInt(m)] = val / 1000;
                    });

                    return {
                        name,
                        value: totalInThousands,
                        percentage: percentageOfBudget,
                        monthlyValues: monthlyInThousands
                    };
                })
                .filter(c => c.value > 0)
                .sort((a, b) => b.value - a.value);

            contractsOutput = {
                contractsCount: contracts.length,
                totalBudget,
                totalRealized,
                totalAnnualRealized,
                contracts: contracts.slice(0, 10)
            };
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            contractsOutput
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
