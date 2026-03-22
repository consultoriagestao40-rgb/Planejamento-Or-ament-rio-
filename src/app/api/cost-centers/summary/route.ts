import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

async function ensureLockSchema() {
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "CostCenterLock" (
                "id" TEXT NOT NULL,
                "tenantId" TEXT NOT NULL,
                "costCenterId" TEXT NOT NULL,
                "year" INTEGER NOT NULL,
                "isLocked" BOOLEAN NOT NULL DEFAULT false,
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "n1ApprovedBy" TEXT,
                "n1ApprovedAt" TIMESTAMP(3),
                "n2ApprovedBy" TEXT,
                "n2ApprovedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "CostCenterLock_pkey" PRIMARY KEY ("id")
            );
        `);
        // Add columns individually for existing DB migrations
        const cols = [
            `ALTER TABLE "CostCenterLock" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';`,
            `ALTER TABLE "CostCenterLock" ADD COLUMN IF NOT EXISTS "n1ApprovedBy" TEXT;`,
            `ALTER TABLE "CostCenterLock" ADD COLUMN IF NOT EXISTS "n1ApprovedAt" TIMESTAMP(3);`,
            `ALTER TABLE "CostCenterLock" ADD COLUMN IF NOT EXISTS "n2ApprovedBy" TEXT;`,
            `ALTER TABLE "CostCenterLock" ADD COLUMN IF NOT EXISTS "n2ApprovedAt" TIMESTAMP(3);`
        ];
        for (const sql of cols) {
             try { await prisma.$executeRawUnsafe(sql); } catch(e) {}
        }
        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS "CostCenterLock_tenantId_costCenterId_year_key" 
            ON "CostCenterLock"("tenantId", "costCenterId", "year");
        `);
    } catch (err) {
        console.error("[SCHEMA] Error insuring CostCenterLock schema:", err);
    }
}

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

        await ensureTenantSchema();
        await ensureLockSchema();

        let costCenterAccessMap: Record<string, string> = {};
        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { costCenterAccess: true }
            });
            if (dbUser) {
                dbUser.costCenterAccess.forEach((c: any) => {
                    costCenterAccessMap[c.costCenterId] = c.accessLevel;
                });
            }
        }

        // 1. Buscar todos os dados necessários
        const allTenants = await prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true, taxRate: true } });
        
        // 1. Mapeamento de Entidades (Deduplicação)
        const tenantToPrimaryMap = new Map<string, string>();
        const seenKeys = new Set<string>();
        const deduplicatedTenantsMap = new Map<string, any>();
        
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

        const dbUser = await prisma.user.findUnique({
            where: { email: (user as any).email },
            include: { tenantAccess: true }
        });

        const userRole = dbUser?.role || 'GESTOR';

        // Use role-based filtering for the tenants shown in the summary
        const tenants = userRole === 'MASTER' 
            ? Array.from(deduplicatedTenantsMap.values())
            : allTenants.filter(t => dbUser?.tenantAccess.some(a => a.tenantId === t.id));

        const primaryTenantIds = new Set(tenants.map(t => t.id));

        const [costCenters, categories, budgetEntries, realizedEntries, locks] = await Promise.all([
            prisma.costCenter.findMany({ 
                where: { 
                    NOT: { 
                        OR: [
                            { name: { contains: '[INATIVO]' } },
                            { name: { contains: 'ENCERRADO', mode: 'insensitive' } }
                        ]
                    } 
                },
                select: { id: true, name: true, tenantId: true } 
            }),
            prisma.category.findMany({ 
                select: { id: true, type: true, name: true, entradaDre: true } 
            }),
            prisma.budgetEntry.findMany({
                where: { year: currentYear },
                select: { amount: true, radarAmount: true, categoryId: true, costCenterId: true, tenantId: true }
            }),
            prisma.realizedEntry.findMany({
                where: { 
                    year: currentYear,
                    viewMode: (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia'
                },
                select: { amount: true, categoryId: true, costCenterId: true, tenantId: true }
            }),
            (prisma as any).costCenterLock.findMany({
                where: { year: currentYear }
            })
        ]);

        const categoryTypeMap = new Map(categories.map((c: any) => {
            const nameLower = (c.name || '').toLowerCase();
            const isRevenue = c.type === 'REVENUE' || 
                             (c.name || '').startsWith('01') || 
                             (c.name || '').startsWith('1.') || 
                             nameLower.includes('receita') || 
                             nameLower.includes('faturamento') || 
                             nameLower.includes('vendas') ||
                             c.entradaDre === '01. RECEITA BRUTA';
            return [c.id, isRevenue ? 'REVENUE' : 'EXPENSE'];
        }));

        // 3. Inicializar estrutura de resumo
        const summaryMap = new Map();

        // Adicionar uma entrada "Geral" para cada Tenant Principal
        for (const tenantId of primaryTenantIds) {
            const tenant = tenants.find(t => t.id === tenantId);
            if (!tenant) continue;
            
            const key = `GERAL-${tenantId}`;
            summaryMap.set(key, {
                tenantId: tenantId,
                tenantName: tenant.name,
                costCenterName: 'GERAL (NÃO ALOCADO)',
                taxRate: tenant.taxRate || 0,
                costCenterId: 'DEFAULT',
                totalRevenueBudget: 0,
                totalRevenueRealized: 0,
                totalExpenseBudget: 0,
                totalExpenseRealized: 0,
                totalTaxesRealized: 0,
                totalRevenue: 0,
                totalExpense: 0,
                hasBudgetData: false,
                hasRealizedData: false,
                isLocked: false,
                status: 'APPROVED',
                currentUserAccessLevel: 'MASTER'
            });
        }

        // Garantir que todos os Centros de Custo apareçam
        costCenters.forEach((cc: any) => {
            const primaryTenantId = tenantToPrimaryMap.get(cc.tenantId);
            const tenant = tenants.find((t: any) => t.id === primaryTenantId);
            if (!tenant) return;

            const key = cc.id;
            const lock = locks.find((l: any) => l.costCenterId === cc.id);

            summaryMap.set(key, {
                tenantId: primaryTenantId,
                tenantName: tenant.name,
                costCenterName: cc.name,
                taxRate: tenant.taxRate || 0,
                costCenterId: cc.id,
                totalRevenueBudget: 0,
                totalRevenueRealized: 0,
                totalExpenseBudget: 0,
                totalExpenseRealized: 0,
                totalTaxesRealized: 0,
                totalRevenue: 0,
                totalExpense: 0,
                hasBudgetData: false,
                hasRealizedData: false,
                isLocked: lock?.isLocked || false,
                status: lock?.status || 'PENDING',
                currentUserAccessLevel: user.role === 'MASTER' ? 'MASTER' : (costCenterAccessMap[cc.id] || 'NONE')
            });
        });

        // 4. Agregar valores do orçamento
        let directMatches = 0;
        let fallbackMatches = 0;
        let notFound = 0;

        budgetEntries.forEach((entry: any) => {
            const primaryId = tenantToPrimaryMap.get(entry.tenantId);
            if (!primaryId) return;

            let key = entry.costCenterId;
            if (!key || key === 'DEFAULT') {
                key = `GERAL-${primaryId}`;
            }
            
            let summary = summaryMap.get(key);
            
            if (summary) {
                directMatches++;
            } else {
                summary = summaryMap.get(`GERAL-${primaryId}`);
                if (summary) fallbackMatches++;
                else notFound++;
            }

            if (summary) {
                const type = categoryTypeMap.get(entry.categoryId);
                if (type === 'REVENUE') {
                    summary.totalRevenueBudget += entry.amount || 0;
                } else {
                    summary.totalExpenseBudget += entry.amount || 0;
                }
                if (entry.amount && entry.amount !== 0) {
                    summary.hasBudgetData = true;
                }
            }
        });
        console.log(`[SUMMARY DEBUG] Budget: Direct=${directMatches}, Fallback=${fallbackMatches}, NotFound=${notFound}`);

        // 5. Agregar valores do realizado
        realizedEntries.forEach((entry: any) => {
            const primaryId = tenantToPrimaryMap.get(entry.tenantId);
            if (!primaryId) return;

            let key = entry.costCenterId;
            if (!key || key === 'DEFAULT') {
                key = `GERAL-${primaryId}`;
            }
            
            let summary = summaryMap.get(key);
            
            // Fallback para GERAL se CC não encontrado
            if (!summary) {
                summary = summaryMap.get(`GERAL-${primaryId}`);
            }

            if (summary) {
                const type = categoryTypeMap.get(entry.categoryId);
                const cat = categories.find((c: any) => c.id === entry.categoryId);
                const nameLower = (cat?.name || '').toLowerCase();
                
                const isTax = cat?.entradaDre === '02. TRIBUTO SOBRE FATURAMENTO' || 
                              cat?.entradaDre === '02. DEDUÇÕES DA RECEITA BRUTA' || 
                              nameLower.includes('simples nacional') ||
                              nameLower.includes('das ') || 
                              nameLower.includes(' iss ') ||
                              (nameLower.includes('imposto') && (nameLower.includes('sobre') || nameLower.includes('receita')));

                if (type === 'REVENUE') {
                    summary.totalRevenueRealized += (entry.amount || 0);
                } else {
                    summary.totalExpenseRealized += (entry.amount || 0);
                }
                
                if (isTax) {
                    summary.totalTaxesRealized += (entry.amount || 0);
                }

                if (entry.amount !== 0) {
                    summary.hasRealizedData = true;
                }
            }
        });

        // 5. Finalize totals and filter results
        const result = Array.from(summaryMap.values())
            .filter(item => {
                // Se for um item real (CC), mostrar sempre (se não for inativo/encerrado já filtrado no SQL)
                if (item.costCenterId !== 'DEFAULT') return true;
                // Se for item GERAL, mostrar apenas se tiver algum dado
                return item.hasBudgetData || item.hasRealizedData;
            });

        return NextResponse.json({ 
            success: true, 
            data: result,
            debugInfo: {
                budgetEntriesCount: budgetEntries.length,
                realizedEntriesCount: realizedEntries.length,
                summaryMapSize: summaryMap.size,
                year: currentYear,
                budgetStats: { directMatches, fallbackMatches, notFound }
            }
        });

    } catch (error: any) {
        console.error('Failed to fetch budget summary:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
