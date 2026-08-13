import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

async function getCurrentUser() {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;
    return await verifyToken(token);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role === 'EXTERNO') {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const {
            month,
            year,
            value,
            billingDay,
            dueDay,
            isCancelled
        } = body;

        if (month === undefined || year === undefined) {
            return NextResponse.json({ success: false, error: 'month e year são obrigatórios' }, { status: 400 });
        }

        const override = await prisma.billingOverride.upsert({
            where: {
                billingContractId_month_year: {
                    billingContractId: id,
                    month: parseInt(month),
                    year: parseInt(year)
                }
            },
            update: {
                value: value !== undefined && value !== null ? parseFloat(value) : null,
                billingDay: billingDay !== undefined && billingDay !== null ? parseInt(billingDay) : null,
                dueDay: dueDay !== undefined && dueDay !== null ? parseInt(dueDay) : null,
                isCancelled: isCancelled !== undefined ? !!isCancelled : false
            },
            create: {
                billingContractId: id,
                month: parseInt(month),
                year: parseInt(year),
                value: value !== undefined && value !== null ? parseFloat(value) : null,
                billingDay: billingDay !== undefined && billingDay !== null ? parseInt(billingDay) : null,
                dueDay: dueDay !== undefined && dueDay !== null ? parseInt(dueDay) : null,
                isCancelled: isCancelled !== undefined ? !!isCancelled : false
            }
        });

        return NextResponse.json({ success: true, override });
    } catch (error) {
        console.error('Error creating/updating billing override:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}
