import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const currentYear = 2026;
        const filterMode = 'active';
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities

        // 1. Fetch Basic Data
        const [tenants, costCenters, categories, budgets, realizedEntries, locks] = await Promise.all([
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
            }),
            prisma.costCenterLock.findMany({
                where: { year: currentYear }
            })
        ]);

        const tenantMap = new Map(tenants.map(t => [t.id, t]));
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        
        const getCleanName = (name: string) => {
            return (name || '')
                .replace(/^\[INATIVO\]\s*/i, '')
                .replace(/^ENCERRADO\s*/i, '')
                .replace(/^[\d. ]+-?\s*/, '')
                .replace(/\s*\(NOTURNO\)\s*/i, '')
                .replace(/\s*\(DIURNO\)\s*/i, '')
                .trim();
        };

        const costCenterMap = new Map(costCenters.map(cc => [cc.id, cc]));
        const shortIdMap = new Map();
        costCenters.forEach(cc => {
            if (cc.id.includes(':')) {
                shortIdMap.set(cc.id.split(':').pop()!, cc);
            }
        });

        // 2. Initialize Summary Map
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
                    costCenterName: cc.name,
                    isCandidateInactive: isInactive
                };
            }
        });

        let finalData = Object.values(summaryMap);

        // Filter out groups that are PURELY Inactive
        finalData = finalData.filter(item => {
            const isInactive = item.isCandidateInactive;
            const name = item.costCenterName.toUpperCase();
            
            if (name.includes('CLEAN TECH') || name.includes('RIO NEGRINHO') || name.includes('REDE TONIN')) {
                return false;
            }
            if (filterMode === 'active' && isInactive) return false;
            if (filterMode === 'inactive' && !isInactive) return false;
            return true;
        });

        // Filter JVS Facilities only for this debug output
        const jvsAllData = finalData.filter(item => item.tenantId === tenantId);

        // Simulate GESTOR (Francis Gomes)
        const coordUser = await prisma.user.findFirst({
            where: { email: 'coordenacao@grupojvsserv.com.br' },
            include: { costCenterAccess: true }
        });
        
        let jvsGestorData: any[] = [];
        let allowedCleanNamesList: string[] = [];
        if (coordUser) {
            const allowedCleanNames = new Set<string>();
            coordUser.costCenterAccess.forEach(a => {
                const cc = costCenterMap.get(a.costCenterId);
                if (cc) {
                    allowedCleanNames.add(getCleanName(cc.name));
                }
            });
            allowedCleanNamesList = Array.from(allowedCleanNames);

            jvsGestorData = jvsAllData.filter(item => 
                item.costCenterId === 'DEFAULT' || allowedCleanNames.has(getCleanName(item.costCenterName))
            );
        }

        return NextResponse.json({
            success: true,
            jvsTotalActiveInDb: costCenters.filter(cc => cc.tenantId === tenantId).length,
            jvsSummaryMapKeysTotal: jvsAllData.length,
            masterSees: jvsAllData.map(cc => cc.costCenterName),
            gestorAllowedCleanNames: allowedCleanNamesList,
            gestorSees: jvsGestorData.map(cc => cc.costCenterName)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
