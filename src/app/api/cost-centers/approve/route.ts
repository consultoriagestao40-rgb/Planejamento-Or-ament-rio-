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

        // action can be: 'SUBMIT_N1', 'APPROVE_N2', 'REJECT', 'REOPEN'
        if (!['SUBMIT_N1', 'APPROVE_N2', 'REJECT', 'REOPEN'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Ação inválida' }, { status: 400 });
        }

        if (['APPROVE_N2', 'REJECT', 'REOPEN'].includes(action) && user.role !== 'MASTER') {
            return NextResponse.json({ success: false, error: 'Apenas MASTER pode realizar esta ação' }, { status: 403 });
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
                if (currentLock?.status !== 'AWAITING_N2') {
                    return NextResponse.json({ success: false, error: 'O orçamento não está aguardando N2.' }, { status: 400 });
                }
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
