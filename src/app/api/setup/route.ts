import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function ensureTenantSchema() {
    try {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION DEFAULT 0;
        `);
    } catch (err) {
        console.error("[SCHEMA] Error insuring Tenant schema:", err);
    }
}

export async function GET() {
    try {
        await ensureTenantSchema();
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const inactiveFilter = {
            NOT: {
                OR: [
                    { name: { contains: '[INATIVO]' } },
                    { name: { contains: 'ENCERRADO', mode: 'insensitive' } }
                ]
            }
        };

        let categoryFilter: any = { ...inactiveFilter };
        let costCenterFilter: any = { ...inactiveFilter };





        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { 
                    tenantAccess: true, 
                    costCenterAccess: {
                        include: { costCenter: true }
                    }
                }
            });

            if (dbUser) {
                const tenantIdsFromTenants = dbUser.tenantAccess.map((t: any) => t.tenantId);
                const tenantIdsFromCCs = dbUser.costCenterAccess.map((c: any) => c.costCenter.tenantId);
                
                // Set of all unique tenant IDs the user can see data for
                const allVisibleTenantIds = Array.from(new Set([...tenantIdsFromTenants, ...tenantIdsFromCCs]));
                const costCenterIds = dbUser.costCenterAccess.map((c: any) => c.costCenterId);

                categoryFilter = { tenantId: { in: allVisibleTenantIds }, ...inactiveFilter };
                costCenterFilter = { id: { in: costCenterIds }, ...inactiveFilter };
            }
        }

        const [categories, costCenters] = await Promise.all([
            prisma.category.findMany({
                where: categoryFilter,
                orderBy: { name: 'asc' }
            }),
            prisma.costCenter.findMany({
                where: costCenterFilter,
                include: { tenant: { select: { taxRate: true } } },
                orderBy: { name: 'asc' }
            })
        ]);

        return NextResponse.json({
            success: true,
            categories: categories.map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                parentId: cat.parentId,
                type: cat.type,
                tenantId: cat.tenantId,
                entradaDre: (cat as any).entradaDre || null
            })),
            costCenters: costCenters.map((cc: any) => ({
                id: cc.id,
                name: cc.name,
                tenantId: cc.tenantId,
                taxRate: cc.tenant?.taxRate || 0
            }))
        });
    } catch (error: any) {
        console.error('Setup fetch failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
