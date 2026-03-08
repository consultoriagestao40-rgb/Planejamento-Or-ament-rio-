import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { tenantId, costCenterId, year, action } = await request.json();

        if (!tenantId || !costCenterId || !year || !action) {
            return NextResponse.json({ success: false, error: 'Dados incompletos' }, { status: 400 });
        }

        // action can be: 'SUBMIT_N1', 'APPROVE_N1', 'APPROVE_N2', 'REJECT', 'REOPEN'
        if (!['SUBMIT_N1', 'APPROVE_N1', 'APPROVE_N2', 'REJECT', 'REOPEN'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Ação inválida' }, { status: 400 });
        }

        let hasN1Power = user.role === 'MASTER';
        let hasN2Power = user.role === 'MASTER';

        if (user.role === 'GESTOR') {
            const access = await prisma.userCostCenterAccess.findUnique({
                where: { userId_costCenterId: { userId: user.userId as string, costCenterId } }
            });

            const level = access?.accessLevel || 'LEITOR';
            if (['APROVADOR_N1', 'APROVADOR_N1_N2'].includes(level)) hasN1Power = true;
            if (['APROVADOR_N2', 'APROVADOR_N1_N2'].includes(level)) hasN2Power = true;
        }

        if (action === 'SUBMIT_N1' && !hasN1Power) {
            return NextResponse.json({ success: false, error: 'Sem permissão de Aprovador N1 para esta área' }, { status: 403 });
        }

        if (['APPROVE_N2', 'REJECT', 'REOPEN'].includes(action) && !hasN2Power) {
            return NextResponse.json({ success: false, error: 'Sem permissão de Aprovador N2/Master para esta ação' }, { status: 403 });
        }

        const currentLock = await (prisma as any).costCenterLock.findUnique({
            where: { tenantId_costCenterId_year: { tenantId, costCenterId, year: parseInt(year) } }
        });

        const updateData: any = {
            tenantId,
            costCenterId,
            year: parseInt(year)
        };

        const now = new Date();
        const userName = user.name || user.email;

        switch(action) {
            case 'SUBMIT_N1':
                updateData.status = 'AWAITING_N2';
                updateData.isLocked = true;
                updateData.n1ApprovedBy = userName;
                updateData.n1ApprovedAt = now;
                break;
            case 'APPROVE_N2':

                updateData.status = 'APPROVED';
                updateData.isLocked = true;
                updateData.n2ApprovedBy = userName;
                updateData.n2ApprovedAt = now;
                break;
            case 'REJECT':
                updateData.status = 'REJECTED';
                updateData.isLocked = false;
                // Clear previous N2 approvals since it's rejected
                updateData.n2ApprovedBy = null;
                updateData.n2ApprovedAt = null;
                break;
            case 'REOPEN':
                updateData.status = 'PENDING';
                updateData.isLocked = false;
                // Clear all history to start fresh
                updateData.n1ApprovedBy = null;
                updateData.n1ApprovedAt = null;
                updateData.n2ApprovedBy = null;
                updateData.n2ApprovedAt = null;
                break;
        }

        await (prisma as any).costCenterLock.upsert({
            where: { tenantId_costCenterId_year: { tenantId, costCenterId, year: parseInt(year) } },
            create: updateData,
            update: updateData
        });

        return NextResponse.json({ success: true, message: 'Status atualizado com sucesso' });

    } catch (error: any) {
        console.error('Error in approval API:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
