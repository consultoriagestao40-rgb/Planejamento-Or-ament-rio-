import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

async function verifyMasterContext() {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;
    const user = await verifyToken(token);
    return user?.role === 'MASTER' ? user : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!await verifyMasterContext()) {
        return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, taxRate } = body;
        
        if (!name && taxRate === undefined) return NextResponse.json({ success: false, error: 'Dados insuficientes' }, { status: 400 });

        const updateData: any = {};
        if (name) updateData.name = name;
        if (taxRate !== undefined) updateData.taxRate = parseFloat(taxRate);

        const updated = await prisma.tenant.update({
            where: { id },
            data: updateData
        });
        return NextResponse.json({ success: true, company: updated });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!await verifyMasterContext()) {
        return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
    }
    try {
        const { id } = await params;
        
        // Cascading delete might be required if prisma schema doesn't have onDelete: Cascade
        // For safety, we only delete the tenant if the user really wants.
        // Prisma schema doesn't have cascade on relation, so we must delete children first.
        await prisma.$transaction([
            prisma.budgetEntry.deleteMany({ where: { tenantId: id } }),
            prisma.category.deleteMany({ where: { tenantId: id } }),
            prisma.userCostCenterAccess.deleteMany({ where: { costCenter: { tenantId: id } } }),
            prisma.costCenter.deleteMany({ where: { tenantId: id } }),
            prisma.userTenantAccess.deleteMany({ where: { tenantId: id } }),
            prisma.tenant.delete({ where: { id } })
        ]);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
