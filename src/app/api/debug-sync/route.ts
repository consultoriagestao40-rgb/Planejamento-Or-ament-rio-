import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const year = 2026;
        const month = 1;
        
        const entries = await prisma.realizedEntry.findMany({
            where: { year, month },
            include: { category: true, costCenter: true, tenant: true }
        });

        // Focus on Revenue (starts with 01)
        const revenueEntries = entries.filter(e => e.category?.name?.startsWith('01'));
        const revenueTotal = revenueEntries.reduce((acc, e) => acc + e.amount, 0);

        const breakdown = revenueEntries.map(e => ({
            cat: e.category.name,
            cc: e.costCenter?.name || "SEM CC (GERAL)",
            amt: e.amount,
            tenant: e.tenant.name,
            id: e.id,
            extId: e.externalId
        })).sort((a,b) => b.amt - a.amt);

        return NextResponse.json({
            success: true,
            month,
            revenueTotal,
            entryCount: revenueEntries.length,
            breakdown,
            allEntriesTotal: entries.reduce((acc, e) => acc + e.amount, 0)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
