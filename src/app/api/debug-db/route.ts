import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spotTenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // Spot Facilities
        const year = 2026;
        const month = 1;

        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId: spotTenantId, year, month },
            include: { category: true, costCenter: true }
        });

        let totalRevenue = 0;
        let totalExpense = 0;
        const byCategory: Record<string, { total: number, ids: string[] }> = {};
        const logs: any[] = [];

        entries.forEach(e => {
            const catName = e.category?.name || 'Sem Categoria';
            const catId = e.category?.id || '';
            const ccName = e.costCenter?.name || 'Geral (Null)';
            const isRevenue = catName.startsWith('01') || catId.includes(':01');

            if (!byCategory[catName]) byCategory[catName] = { total: 0, ids: [] };
            byCategory[catName].total += e.amount;
            byCategory[catName].ids.push(e.id);

            if (isRevenue) totalRevenue += e.amount;
            else totalExpense += e.amount;
            
            if (isRevenue || catName.startsWith('03.1')) {
               logs.push({ id: e.id, cat: catName, amount: e.amount, loc: ccName, desc: e.description });
            }
        });

        return NextResponse.json({
            success: true,
            spotTenantId,
            totalRevenue,
            totalExpense,
            categoryTotals: byCategory,
            detailLogs: logs
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
