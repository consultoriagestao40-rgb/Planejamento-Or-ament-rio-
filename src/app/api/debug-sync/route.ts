import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const year = 2026;
        const month = 1; // Janeiro
        
        // 1. All entries for January 2026
        const entries = await prisma.realizedEntry.findMany({
            where: { year, month },
            include: { category: true, costCenter: true }
        });

        const summary: Record<string, { cat: string, cc: string, sum: number, tenant: string }> = {};
        let totalRevenue = 0;
        
        entries.forEach(e => {
            const key = `${e.categoryId}-${e.costCenterId || 'null'}`;
            if (!summary[key]) {
                summary[key] = { 
                    cat: e.category.name, 
                    cc: e.costCenter?.name || 'SEM CC (Geral)', 
                    sum: 0,
                    tenant: e.tenantId
                };
            }
            summary[key].sum += e.amount;
            
            if (e.category.name.startsWith('01')) {
                totalRevenue += e.amount;
            }
        });

        return NextResponse.json({
            success: true,
            audit: {
                januaryTotalRevenue: totalRevenue,
                entryCount: entries.length,
                details: Object.values(summary).sort((a,b) => b.sum - a.sum)
            },
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
