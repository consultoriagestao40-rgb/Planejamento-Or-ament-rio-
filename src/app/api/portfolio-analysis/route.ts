import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const yearParam = searchParams.get('year');
        const currentYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();
        const monthParam = searchParams.get('month') || 'average'; // 1-12, 'average', 'total'
        const sourceParam = searchParams.get('source') || 'realized'; // 'realized', 'budget'
        const viewModeParam = searchParams.get('viewMode') || 'competencia'; // 'competencia', 'caixa'

        // 1. Fetch Basic Data
        const [tenants, costCenters, categories, budgets, realizedEntries] = await Promise.all([
            prisma.tenant.findMany(),
            prisma.costCenter.findMany({ include: { tenant: true } }),
            prisma.category.findMany(),
            prisma.budgetEntry.findMany({ 
                where: { year: currentYear },
                include: { category: true }
            }),
            prisma.realizedEntry.findMany({ 
                where: { year: currentYear, viewMode: viewModeParam },
                include: { category: true }
            })
        ]);

        const tenantMap = new Map(tenants.map(t => [t.id, t]));
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        const costCenterMap = new Map(costCenters.map(cc => [cc.id, cc]));
        
        const shortIdMap = new Map();
        costCenters.forEach(cc => {
            if (cc.id.includes(':')) {
                shortIdMap.set(cc.id.split(':').pop()!, cc);
            }
        });

        // Consolidar variantes de tenant (CNPJs duplicados / múltiplos tokens)
        const { getTenantGroups } = await import('@/lib/tenant-utils');
        const tenantGroups = await getTenantGroups();
        
        const getPrimaryId = (id: string) => {
            const group = tenantGroups.find(g => g.includes(id));
            return group ? group[0] : id;
        };

        const primaryTenantNames = new Map<string, string>();
        tenants.forEach(t => {
            const pId = getPrimaryId(t.id);
            if (!primaryTenantNames.has(pId)) {
                primaryTenantNames.set(pId, t.name);
            }
        });

        // Helper to normalize cost center names
        const getCleanName = (name: string) => {
            return (name || '')
                .replace(/^\[INATIVO\]\s*/i, '')
                .replace(/^ENCERRADO\s*/i, '')
                .replace(/^[\d. ]+-?\s*/, '') // Remove numeric prefixes
                .replace(/\s*\(NOTURNO\)\s*/i, '')
                .replace(/\s*\(DIURNO\)\s*/i, '')
                .trim();
        };

        // Helper to classify category codes
        const getCategoryCode = (name: string) => {
            const codeMatch = name.match(/^([\d.]+)/);
            return codeMatch ? codeMatch[1] : '';
        };

        const classifyCategory = (cat: { name: string; type: string }) => {
            const catName = cat.name || '';
            const nameUpper = catName.toUpperCase();

            const rawCode = getCategoryCode(catName);
            
            if (rawCode) {
                // Se tem código, classifica estritamente pelo código
                let effectiveCode = rawCode;
                
                // Remapear 02 para 01.2 se não for 02.1 (Receita vs Tributos)
                if ((rawCode.startsWith('02') && !rawCode.startsWith('02.1')) || 
                    (rawCode.startsWith('2') && !nameUpper.includes('TRIBUTO') && !rawCode.startsWith('2.1'))) {
                    if (rawCode.startsWith('02') && !rawCode.startsWith('02.1')) {
                        let suffix = rawCode.replace(/^0?2/, '');
                        if (suffix.startsWith('.')) suffix = suffix.substring(1);
                        effectiveCode = suffix ? `01.2.${suffix}` : '01.2';
                    }
                }

                if (effectiveCode.startsWith('01') || effectiveCode.startsWith('1')) {
                    return 'REVENUE';
                }
                if (effectiveCode.startsWith('02') || effectiveCode.startsWith('2.1') || nameUpper.includes('TRIBUTO') || nameUpper.includes('IMPOSTO')) {
                    return 'TAXES';
                }
                if (effectiveCode.startsWith('03') || effectiveCode.startsWith('3')) {
                    return 'COSTS';
                }
                return 'OTHER';
            } else {
                // Se NÃO tem código na descrição, usa o campo tipo do banco como fallback
                const typeUpper = (cat.type || '').toUpperCase();
                if (typeUpper === 'REVENUE' || typeUpper === 'RECEITA') {
                    return 'REVENUE';
                }
                return 'OTHER';
            }
        };

        interface GroupData {
            tenantId: string;
            tenantName: string;
            costCenterId: string;
            costCenterName: string;
            monthlyData: {
                [month: number]: {
                    revenue: number;
                    taxes: number;
                    costs: number;
                }
            }
        }

        const groupsMap: Record<string, GroupData> = {};

        // Inicializar grupos únicos por (Tenant Primário + Nome Limpo de CC)
        costCenters.forEach(cc => {
            const cleanName = getCleanName(cc.name);
            const pTenantId = getPrimaryId(cc.tenantId);
            const key = `${pTenantId}-${cleanName}`;
            
            const originalName = (cc.name || '').toUpperCase();
            const blacklist = ['CLEAN TECH', 'RIO NEGRINHO', 'REDE TONIN'];
            const isWhiteListed = originalName.includes('CLEAN TECH PRO');
            
            const isBlacklisted = !isWhiteListed && (
                blacklist.some(b => originalName.includes(b)) || 
                originalName.includes('[INATIVO]') || 
                originalName.includes('ENCERRADO')
            );

            if (isBlacklisted) return;

            if (!groupsMap[key]) {
                groupsMap[key] = {
                    tenantId: pTenantId,
                    tenantName: primaryTenantNames.get(pTenantId) || cc.tenant.name,
                    costCenterId: cc.id,
                    costCenterName: cleanName,
                    monthlyData: {}
                };
                for (let m = 1; m <= 12; m++) {
                    groupsMap[key].monthlyData[m] = { revenue: 0, taxes: 0, costs: 0 };
                }
            }
        });

        // Inicializar grupo "GERAL" para cada tenant primário
        const uniquePrimaryTenantIds = Array.from(new Set(tenants.map(t => getPrimaryId(t.id))));
        uniquePrimaryTenantIds.forEach(pId => {
            const key = `${pId}-DEFAULT`;
            groupsMap[key] = {
                tenantId: pId,
                tenantName: primaryTenantNames.get(pId) || 'Empresa',
                costCenterId: 'DEFAULT',
                costCenterName: 'GERAL (Sem Centro de Custo)',
                monthlyData: {}
            };
            for (let m = 1; m <= 12; m++) {
                groupsMap[key].monthlyData[m] = { revenue: 0, taxes: 0, costs: 0 };
            }
        });

        // 2. Agregação direta de dados (Sem deduplicação e associando ao tenant primário)
        const entriesToProcess = sourceParam === 'budget' ? budgets : realizedEntries;

        entriesToProcess.forEach(entry => {
            const cc = entry.costCenterId ? (costCenterMap.get(entry.costCenterId) || shortIdMap.get(entry.costCenterId)) : null;
            const cleanName = cc ? getCleanName(cc.name) : 'DEFAULT';
            
            const pTenantId = getPrimaryId(entry.tenantId);
            const key = `${pTenantId}-${cleanName}`;

            if (!groupsMap[key]) return;

            const cat = categoryMap.get(entry.categoryId);
            if (!cat) return;

            const classification = classifyCategory(cat);
            if (classification === 'REVENUE') {
                groupsMap[key].monthlyData[entry.month].revenue += entry.amount || 0;
            } else if (classification === 'TAXES') {
                groupsMap[key].monthlyData[entry.month].taxes += entry.amount || 0;
            } else if (classification === 'COSTS') {
                groupsMap[key].monthlyData[entry.month].costs += entry.amount || 0;
            }
        });

        // 3. Process time periods and compute metrics
        const calculatedData = Object.values(groupsMap).map(group => {
            let revenue = 0;
            let taxes = 0;
            let costs = 0;

            if (monthParam === 'average') {
                let revSum = 0, taxSum = 0, costSum = 0;
                for (let m = 1; m <= 12; m++) {
                    revSum += group.monthlyData[m].revenue;
                    taxSum += group.monthlyData[m].taxes;
                    costSum += group.monthlyData[m].costs;
                }
                revenue = revSum / 12;
                taxes = taxSum / 12;
                costs = costSum / 12;
            } else if (monthParam === 'total') {
                for (let m = 1; m <= 12; m++) {
                    revenue += group.monthlyData[m].revenue;
                    taxes += group.monthlyData[m].taxes;
                    costs += group.monthlyData[m].costs;
                }
            } else {
                const m = parseInt(monthParam);
                if (m >= 1 && m <= 12) {
                    revenue = group.monthlyData[m].revenue;
                    taxes = group.monthlyData[m].taxes;
                    costs = group.monthlyData[m].costs;
                }
            }

            const netRevenue = revenue - taxes;
            const grossMargin = netRevenue - costs;
            const grossMarginPercent = revenue > 0 ? (grossMargin / revenue) * 100 : 0;

            return {
                tenantId: group.tenantId,
                tenantName: group.tenantName,
                costCenterId: group.costCenterId,
                costCenterName: group.costCenterName,
                revenue,
                taxes,
                netRevenue,
                costs,
                grossMargin,
                grossMarginPercent
            };
        });

        // Keep only groups that have some revenue (as requested: "centro de custos com receita")
        let filteredData = calculatedData.filter(item => Math.abs(item.revenue) > 0.01 || item.costCenterName === 'GERAL (Sem Centro de Custo)');

        // Apply security permissions for GESTOR
        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { costCenterAccess: true }
            });
            if (dbUser) {
                const allowedCleanNames = new Set();
                dbUser.costCenterAccess.forEach(a => {
                    const cc = costCenterMap.get(a.costCenterId);
                    if (cc) allowedCleanNames.add(getCleanName(cc.name));
                });
                filteredData = filteredData.filter(item => 
                    item.costCenterId === 'DEFAULT' || allowedCleanNames.has(getCleanName(item.costCenterName))
                );
            }
        }

        // Sort by Company and then Cost Center Name
        filteredData.sort((a, b) => {
            const comp = a.tenantName.localeCompare(b.tenantName);
            if (comp !== 0) return comp;
            return a.costCenterName.localeCompare(b.costCenterName);
        });

        return NextResponse.json({
            success: true,
            data: filteredData,
            year: currentYear,
            month: monthParam,
            source: sourceParam,
            viewMode: viewModeParam
        });

    } catch (error: any) {
        console.error('Falha ao calcular análise de carteira:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
