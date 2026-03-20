import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAllVariantIds } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        
        if (!tenantId) return NextResponse.json({ error: "Missing tenantId" });
        
        const allVariantIds = await getAllVariantIds(tenantId);
        
        // Busca TODOS os lançamentos de JANEIRO 2026
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: allVariantIds },
                month: 1,
                year: 2026
            }
        });

        // Filtrar apenas RECEITAS (CategoryId que começa com 01)
        const revenueEntries = entries.filter(e => e.categoryId.includes(':01') || e.categoryId.startsWith('01'));
        const totalRevenue = revenueEntries.reduce((acc, e) => acc + e.amount, 0);

        return NextResponse.json({
            success: true,
            month: "Janeiro 2026",
            totalRevenueDetected: totalRevenue,
            comparison: {
                expected: 156022.98,
                diff: 156022.98 - totalRevenue
            },
            reconciliationNeeded: 156022.98 - totalRevenue > 0.01,
            breakdown: revenueEntries.map(e => ({
                cat: e.categoryId,
                cc: e.costCenterId || "SEM CENTRO DE CUSTO",
                amount: e.amount,
                desc: e.description,
                tenant: e.tenantId,
                ext: e.externalId
            }))
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
