import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');

    try {
        const allTenants = await prisma.tenant.findMany();
        const budgetEntries = await prisma.budgetEntry.findMany({ where: { year } });
        const costCenters = await prisma.costCenter.findMany();

        const tenantToPrimaryMap = new Map();
        const seenKeys = new Set();
        const deduplicatedTenantsMap = new Map();
        
        allTenants.forEach((t: any) => {
            const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                deduplicatedTenantsMap.set(key, t);
            }
            const primary = deduplicatedTenantsMap.get(key);
            tenantToPrimaryMap.set(t.id, primary.id);
        });

        const summary = {
            totalBudget: 0,
            foundInSummaryMap: 0,
            notFoundInSummaryMap: 0,
            primaryTenantIds: Array.from(new Set(allTenants.map(t => tenantToPrimaryMap.get(t.id)))),
            sampleNotFound: [] as any[]
        };

        const summaryMap = new Map();
        costCenters.forEach(cc => {
            summaryMap.set(cc.id, { id: cc.id, budget: 0 });
        });
        allTenants.forEach(t => {
            summaryMap.set(`GERAL-${t.id}`, { id: `GERAL-${t.id}`, budget: 0 });
        });

        budgetEntries.forEach(e => {
            summary.totalBudget += e.amount || 0;
            const primaryId = tenantToPrimaryMap.get(e.tenantId);
            let key = e.costCenterId || `GERAL-${primaryId}`;
            if (summaryMap.has(key)) {
                summary.foundInSummaryMap++;
                summaryMap.get(key).budget += e.amount || 0;
            } else {
                summary.notFoundInSummaryMap++;
                if (summary.sampleNotFound.length < 5) {
                    summary.sampleNotFound.push({ id: e.id, ccId: e.costCenterId, tenantId: e.tenantId, amount: e.amount });
                }
            }
        });

        return NextResponse.json({
            success: true,
            year,
            summary
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
