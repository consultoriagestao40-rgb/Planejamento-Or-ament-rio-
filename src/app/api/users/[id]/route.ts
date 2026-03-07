import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

async function getMasterUser() {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload || payload.role !== 'MASTER') return null;

    return payload;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const p = await params;
        const master = await getMasterUser();
        if (!master) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const body = await request.json();
        const { name, email, password, role, tenantIds, costCenterAccess } = body;

        const dataToUpdate: any = { name, email, role };

        if (password) {
            dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
        }

        // Delete existing access to replace with new ones
        await prisma.userTenantAccess.deleteMany({ where: { userId: p.id } });
        await prisma.userCostCenterAccess.deleteMany({ where: { userId: p.id } });

        const updatedUser = await prisma.user.update({
            where: { id: p.id },
            data: {
                ...dataToUpdate,
                tenantAccess: {
                    create: (tenantIds || []).map((id: string) => ({ tenantId: id }))
                },
                costCenterAccess: {
                    create: (costCenterAccess || []).map((cc: any) => ({
                        costCenterId: cc.costCenterId,
                        accessLevel: cc.accessLevel || 'EDITAR'
                    }))
                }
            }
        });

        return NextResponse.json({ success: true, user: { id: updatedUser.id, name: updatedUser.name } });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const p = await params;
        const master = await getMasterUser();
        if (!master) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        if (master.userId === p.id) {
            return NextResponse.json({ success: false, error: 'Não é possível excluir o próprio usuário logado' }, { status: 400 });
        }

        await prisma.user.delete({ where: { id: p.id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}
