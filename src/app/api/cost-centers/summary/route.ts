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

        const [costCenters, categories, budgetEntries, locks] = await Promise.all([
            prisma.costCenter.findMany({ 
                // Load ALL cost centers including INATIVO — their budget entries need to be mapped.
                // Frontend filtering (dropdown) is handled separately.
                select: { id: true, name: true, tenantId: true } 
            }),
            prisma.category.findMany({ 
                select: { id: true, type: true, name: true, entradaDre: true } 
            }),
            prisma.budgetEntry.findMany({
                where: { year: currentYear },
                select: { amount: true, radarAmount: true, categoryId: true, costCenterId: true, tenantId: true }
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
        // Map to help route budget/realized entries to the correct summary row
        const ccIdToKeyMap = new Map<string, string>();

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
                n1ApprovedBy: null,
                n1ApprovedAt: null,
                n2ApprovedBy: null,
                n2ApprovedAt: null,
                currentUserAccessLevel: 'MASTER'
            });
        }

        const normalizeName = (name: string) => 
            (name || '')
                .toLowerCase()
                .replace(/^\[inativo\]\s*/i, '')
                .replace(/^encerrado\s*/i, '')
                .replace(/[^a-z0-9]/g, '')
                .trim();

        // Garantir que todos os Centros de Custo apareçam e consolidar duplicatas por nome
        const primaryIdToTenantMap = new Map<string, any>();
        tenants.forEach((t: any) => primaryIdToTenantMap.set(t.id, t));

        costCenters.forEach((cc: any) => {
            const primaryTenantId = tenantToPrimaryMap.get(cc.tenantId);
            if (!primaryTenantId) return;
            
            const tenant = primaryIdToTenantMap.get(primaryTenantId);
            if (!tenant) return;

            const nName = normalizeName(cc.name);
            const key = `CC-${primaryTenantId}-${nName}`;
            
            // Map this specific ID to the consolidated row key
            ccIdToKeyMap.set(cc.id, key);

            if (!summaryMap.has(key)) {
                const lock = locks.find((l: any) => l.costCenterId === cc.id);
                // The display name should be the first "clean" name we find
                const displayName = (cc.name || '')
                    .replace(/^\[INATIVO\]\s*/i, '')
                    .replace(/^ENCERRADO\s*/i, '')
                    .trim();

                summaryMap.set(key, {
                    tenantId: primaryTenantId,
                    tenantName: tenant.name,
                    costCenterName: displayName,
                    taxRate: tenant.taxRate || 0,
                    costCenterId: cc.id,
                    totalRevenueBudget: 0,
                    totalExpenseBudget: 0,
                    totalRevenue: 0,
                    totalExpense: 0,
                    hasBudgetData: false,
                    isLocked: lock?.isLocked || false,
                    status: lock?.status || 'PENDING',
                    n1ApprovedBy: lock?.n1ApprovedBy || null,
                    n1ApprovedAt: lock?.n1ApprovedAt || null,
                    n2ApprovedBy: lock?.n2ApprovedBy || null,
                    n2ApprovedAt: lock?.n2ApprovedAt || null,
                    currentUserAccessLevel: user.role === 'MASTER' ? 'MASTER' : (costCenterAccessMap[cc.id] || 'NONE')
                });
            } else {
                const current = summaryMap.get(key);
                const hasPrefix = (cc.name || '').startsWith('[INATIVO]') || (cc.name || '').startsWith('ENCERRADO');
                if (!hasPrefix) {
                    // Update to active version for display and interactions
                    const lock = locks.find((l: any) => l.costCenterId === cc.id);
                    current.costCenterName = (cc.name || '').trim();
                    current.costCenterId = cc.id;
                    current.isLocked = lock?.isLocked || current.isLocked;
                    current.status = lock?.status || current.status;
                }
            }
        });

        // 4. Agregar valores do orçamento
        let directMatches = 0;
        let fallbackMatches = 0;
        let notFound = 0;

        budgetEntries.forEach((entry: any) => {
            const primaryId = tenantToPrimaryMap.get(entry.tenantId);
            if (!primaryId) return;

            let key = entry.costCenterId ? ccIdToKeyMap.get(entry.costCenterId) : null;
            if (!key || entry.costCenterId === 'DEFAULT') {
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

        // 5. Finalize totals and filter results
        const result = Array.from(summaryMap.values())
            .filter(item => {
                // Se for um item real (CC), mostrar sempre (se não for inativo/encerrado já filtrado no SQL)
                if (item.costCenterId !== 'DEFAULT') return true;
                // Se for item GERAL, mostrar apenas se tiver algum dado
                return item.hasBudgetData;
            });

        return NextResponse.json({ 
            success: true, 
            data: result,
            debugInfo: {
                budgetEntriesCount: budgetEntries.length,
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
