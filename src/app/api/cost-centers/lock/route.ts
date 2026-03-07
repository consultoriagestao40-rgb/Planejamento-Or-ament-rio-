import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user || user.role !== 'MASTER') {
            return NextResponse.json({ success: false, error: 'Apenas administradores podem gerenciar o bloqueio de orçamento' }, { status: 403 });
        }

        const { tenantId, costCenterId, year, isLocked } = await request.json();

        if (!tenantId || !costCenterId || !year) {
            return NextResponse.json({ success: false, error: 'Dados incompletos' }, { status: 400 });
        }

        const lock = await (prisma as any).costCenterLock.upsert({
            where: {
                tenantId_costCenterId_year: {
                    tenantId,
                    costCenterId,
                    year
                }
            },
            update: {
                isLocked,
                updatedAt: new Date()
            },
            create: {
                tenantId,
                costCenterId,
                year,
                isLocked,
                updatedAt: new Date()
            }
        });

        // Also update all BudgetEntry records for this CC/Year to maintain UI consistency in the Dashboard
        await prisma.budgetEntry.updateMany({
            where: {
                tenantId,
                costCenterId: costCenterId === 'DEFAULT' ? null : costCenterId,
                year
            },
            data: {
                isLocked
            }
        });

        return NextResponse.json({ success: true, data: lock });
    } catch (error: any) {
        console.error('Failed to toggle cost center lock:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
