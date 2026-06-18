import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const costCenters = await prisma.costCenter.findMany({
            where: { tenantId }
        });

        const getCleanName = (name: string) => {
            return (name || '')
                .replace(/^\[INATIVO\]\s*/i, '')
                .replace(/^ENCERRADO\s*/i, '')
                .replace(/^[\d. ]+-?\s*/, '')
                .replace(/\s*\(NOTURNO\)\s*/i, '')
                .replace(/\s*\(DIURNO\)\s*/i, '')
                .trim();
        };

        const summaryMap: Record<string, any> = {};

        costCenters.forEach(cc => {
            const cleanName = getCleanName(cc.name);
            const key = `${cc.tenantId}-${cleanName}`;
            const isInactive = (cc.name || '').toUpperCase().includes('[INATIVO]');
            
            const existing = summaryMap[key];
            const shouldReplace = !existing || (!isInactive && existing.isCandidateInactive);

            if (shouldReplace) {
                summaryMap[key] = {
                    key,
                    cleanName,
                    costCenterId: cc.id,
                    costCenterName: cc.name,
                    isCandidateInactive: isInactive,
                    replacedCount: (existing ? existing.replacedCount + 1 : 1),
                    matches: (existing ? [...existing.matches, { id: cc.id, name: cc.name }] : [{ id: cc.id, name: cc.name }])
                };
            } else {
                existing.replacedCount++;
                existing.matches.push({ id: cc.id, name: cc.name });
            }
        });

        return NextResponse.json({
            success: true,
            totalCostCenters: costCenters.length,
            groups: Object.values(summaryMap)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
