import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        console.log("=== STARTING FORENSIC DATA DUMP (JAN/2026) ===");
        
        // 1. Get ALL records for Jan 2026
        const entries = await prisma.budgetEntry.findMany({
            where: { year: 2026, month: 1 },
            include: {
                category: { select: { id: true, name: true, tenantId: true } },
                tenant: { select: { id: true, name: true } }
            }
        });

        const dump = entries.map(e => ({
            id: e.id,
            amount: e.amount,
            catId: e.categoryId,
            catName: e.category?.name,
            catTenantId: e.category?.tenantId,
            entryTenantId: e.tenantId,
            entryTenantName: e.tenant?.name,
            costCenterId: e.costCenterId
        }));

        // 2. Identify the ones totaling 587k
        const relevant = dump.filter(d => 
            (d.catName || "").includes("01.1") || 
            (d.catName || "").includes("1.1") ||
            (d.amount > 1000)
        );

        return NextResponse.json({
            success: true,
            totalFound: entries.length,
            relevantCount: relevant.length,
            relevantData: relevant,
            allDataSample: dump.slice(0, 10)
        });

    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
