import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

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
        const [tenants, costCenters, categories, budgetEntries, realizedEntries, locks] = await Promise.all([
            prisma.tenant.findMany({ select: { id: true, name: true } }),

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
                where: {
                    NOT: {
                        OR: [
                            { name: { contains: '[INATIVO]' } },
                            { name: { contains: 'ENCERRADO', mode: 'insensitive' } }
                        ]
                    }
                },
                select: { id: true, type: true, name: true } 
            }),
            prisma.budgetEntry.findMany({
                where: { year: currentYear },
                select: { amount: true, radarAmount: true, categoryId: true, costCenterId: true, tenantId: true }
            }),
            prisma.realizedEntry.findMany({
                where: { year: currentYear },
                select: { amount: true, categoryId: true, costCenterId: true, tenantId: true }
            }),
            (prisma as any).costCenterLock.findMany({
                where: { year: currentYear }
            })
        ]);



        const categoryTypeMap = new Map(categories.map((c: any) => {
            const nameLower = (c.name || '').toLowerCase();
            const isRevenue = c.type === 'REVENUE' || 
                             c.name.startsWith('01') || 
                             c.name.startsWith('1.') || 
                             nameLower.includes('receita') || 
                             nameLower.includes('faturamento') || 
                             nameLower.includes('vendas');
            return [c.id, isRevenue ? 'REVENUE' : 'EXPENSE'];
        }));

        // 3. Inicializar extrutura de resumo
        const summaryMap = new Map();

        // Garantir que todos os Centros de Custo apareçam, mesmo sem orçamento
        costCenters.forEach((cc: any) => {
            const tenant = tenants.find((t: any) => t.id === cc.tenantId);
            if (!tenant) return;

            const key = cc.id; // Use CC ID as key - it's unique across the system anyway
            const lock = locks.find((l: any) => l.costCenterId === cc.id);

            summaryMap.set(key, {
                tenantId: cc.tenantId,
                tenantName: tenant.name,
                costCenterId: cc.id,
                costCenterName: cc.name,
                totalRevenue: 0,
                totalExpense: 0,
                hasBudgetData: false,
                hasRealizedData: false,
                isLocked: lock?.isLocked || false,
                status: lock?.status || 'PENDING',
                n1ApprovedBy: lock?.n1ApprovedBy || null,
                n1ApprovedAt: lock?.n1ApprovedAt ? new Date(lock.n1ApprovedAt).toISOString() : null,
                n2ApprovedBy: lock?.n2ApprovedBy || null,
                n2ApprovedAt: lock?.n2ApprovedAt ? new Date(lock.n2ApprovedAt).toISOString() : null,
                currentUserAccessLevel: user.role === 'MASTER' ? 'MASTER' : (costCenterAccessMap[cc.id] || 'NONE')
            });



        });

        // 4. Agregar valores do orçamento
        budgetEntries.forEach((entry: any) => {
            const key = entry.costCenterId; 
            const summary = summaryMap.get(key);

            if (summary) {
                const type = categoryTypeMap.get(entry.categoryId);
                // If amount is zero but radarAmount exists, use radarAmount for the summary
                const val = (entry.amount !== 0 && entry.amount !== null) ? entry.amount : (entry.radarAmount || 0);
                
                if (type === 'REVENUE') {
                    summary.totalRevenue += val;
                } else {
                    summary.totalExpense += val;
                }
                
                if (val !== 0) summary.hasBudgetData = true;
            }
        });

        // 4.1 Agregar movimentação Realizada (DRE Ativo)
        realizedEntries.forEach((entry: any) => {
            const key = entry.costCenterId;
            const summary = summaryMap.get(key);

            if (summary && entry.amount !== 0) {
                summary.hasRealizedData = true;
            }
        });

        // 5. Converter para array, filtrar apenas ATIVOS NO DRE (com realizado ou orçado) e ordenar
        const result = Array.from(summaryMap.values())
            .filter(item => item.hasRealizedData || item.hasBudgetData)

            .sort((a, b) => {
                // Ordenar por Empresa e depois por Centro de Custo
                if (a.tenantName !== b.tenantName) return a.tenantName.localeCompare(b.tenantName);
                return a.costCenterName.localeCompare(b.costCenterName);
            });







        return NextResponse.json({
            success: true,
            year: currentYear,
            data: result
        });

    } catch (error: any) {
        console.error('Failed to fetch budget summary:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
