import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const id = '0013c839-93bb-472d-ba64-092c89e1cacf';
    try {
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        const cc = await prisma.costCenter.findUnique({ where: { id }, include: { tenant: true } });
        const budgets = await prisma.budgetEntry.findMany({ 
            where: { OR: [{ costCenterId: id }, { tenantId: id }] },
            take: 20
        });
        return NextResponse.json({ success: true, id, isTenant: !!tenant, isCC: !!cc, cc, budgets });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
