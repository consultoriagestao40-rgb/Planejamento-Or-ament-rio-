import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // ABSOLUTELY NO FILTERS - LOAD EVERYTHING TO RECOVER VISIBILITY
        const [categories, costCenters, tenants] = await Promise.all([
            prisma.category.findMany({ orderBy: { name: 'asc' } }),
            prisma.costCenter.findMany({ 
                include: { tenant: { select: { name: true } } },
                orderBy: { name: 'asc' } 
            }),
            prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true } })
        ]);

        console.log(`[RECOVERY] Loaded ${categories.length} categories and ${costCenters.length} cost centers`);

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
                tenantName: cc.tenant?.name || 'Empresa Desconhecida'
            })),
            tenants: tenants.map((t: any) => ({
                id: t.id,
                name: t.name,
                cnpj: t.cnpj || ''
            }))
        });
    } catch (error: any) {
        console.error('CRITICAL API ERROR during recovery:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
