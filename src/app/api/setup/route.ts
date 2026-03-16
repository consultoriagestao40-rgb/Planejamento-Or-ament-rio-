import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

        const { searchParams } = new URL(request.url);
        const primaryOnly = searchParams.get('primaryOnly') === 'true';

        let categoryFilter: any = { ...inactiveFilter };
        let costCenterFilter: any = { ...inactiveFilter };

        if (primaryOnly) {
            const allTenants = await prisma.tenant.findMany();
            const companyGroups = new Map<string, string[]>();
            allTenants.forEach((t: any) => {
                const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
                const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
                if (!companyGroups.has(key)) companyGroups.set(key, []);
                companyGroups.get(key)!.push(t.id);
            });
            const primaryIds = Array.from(companyGroups.values()).map(ids => ids.sort()[0]);
            categoryFilter.tenantId = { in: primaryIds };
            costCenterFilter.tenantId = { in: primaryIds };
        } else if (user.role === 'GESTOR') {
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
