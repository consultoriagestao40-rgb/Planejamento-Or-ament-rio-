import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        let categoryFilter: any = { isActive: true };
        let costCenterFilter: any = { isActive: true };


        if (user.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId as string },
                include: { tenantAccess: true, costCenterAccess: true }
            });

            if (dbUser) {
                const tenantIds = dbUser.tenantAccess.map(t => t.tenantId);
                const costCenterIds = dbUser.costCenterAccess.map(c => c.costCenterId);

                categoryFilter = { tenantId: { in: tenantIds }, isActive: true };
                costCenterFilter = { id: { in: costCenterIds }, isActive: true };

            }
        }

        const [categories, costCenters] = await Promise.all([
            prisma.category.findMany({
                where: categoryFilter,
                orderBy: { name: 'asc' }
            }),
            prisma.costCenter.findMany({
                where: costCenterFilter,
                orderBy: { name: 'asc' }
            })
        ]);

        return NextResponse.json({
            success: true,
            categories: categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                parentId: cat.parentId,
                type: cat.type,
                tenantId: cat.tenantId,
                entradaDre: (cat as any).entradaDre || null
            })),
            costCenters: costCenters.map(cc => ({
                id: cc.id,
                name: cc.name,
                tenantId: cc.tenantId
            }))
        });
    } catch (error: any) {
        console.error('Setup fetch failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
