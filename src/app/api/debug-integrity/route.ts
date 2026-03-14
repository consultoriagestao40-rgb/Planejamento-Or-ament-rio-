import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const auditResults: any[] = [];

        for (const t of tenants) {
            const entries = await prisma.realizedEntry.findMany({
                where: { tenantId: t.id, year: 2026 },
                include: { category: true }
            });

            const summaryByGroup: Record<string, number> = {};
            const summaryByMode: Record<string, number> = { caixa: 0, competencia: 0 };
            const unclassifiedCategories: string[] = [];

            entries.forEach(e => {
                const group = e.category?.entradaDre || 'SEM CLASSIFICAÇÃO (DRE)';
                summaryByGroup[group] = (summaryByGroup[group] || 0) + e.amount;
                summaryByMode[e.viewMode] = (summaryByMode[e.viewMode] || 0) + e.amount;
                
                if (!e.category?.entradaDre) {
                    if (!unclassifiedCategories.includes(e.category?.name || 'Unknown')) {
                        unclassifiedCategories.push(e.category?.name || 'Unknown');
                    }
                }
            });

            auditResults.push({
                tenantName: t.name,
                tenantId: t.id,
                totalEntries: entries.length,
                summaryByGroup,
                summaryByMode,
                unclassifiedCategories
            });
        }
        
        return NextResponse.json({ success: true, year: 2026, auditResults });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
