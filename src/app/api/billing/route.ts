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

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role === 'EXTERNO') {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();

        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'tenantId é obrigatório' }, { status: 400 });
        }

        const contracts = await prisma.billingContract.findMany({
            where: {
                tenantId,
                isActive: true
            },
            include: {
                overrides: {
                    where: {
                        year
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json({ success: true, contracts });
    } catch (error) {
        console.error('Error fetching billing contracts:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role === 'EXTERNO') {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const body = await request.json();
        const {
            tenantId,
            name,
            clientData,
            paymentMethod,
            billingDay,
            paymentTermDays,
            value,
            startMonth,
            startYear,
            endMonth,
            endYear,
            isRecurring
        } = body;

        if (!tenantId || !name || !paymentMethod || billingDay === undefined || paymentTermDays === undefined || value === undefined || !startMonth || !startYear) {
            return NextResponse.json({ success: false, error: 'Campos obrigatórios ausentes' }, { status: 400 });
        }

        const newContract = await prisma.billingContract.create({
            data: {
                tenantId,
                name,
                clientData: clientData || null,
                paymentMethod,
                billingDay: parseInt(billingDay),
                paymentTermDays: parseInt(paymentTermDays),
                value: parseFloat(value),
                startMonth: parseInt(startMonth),
                startYear: parseInt(startYear),
                endMonth: endMonth ? parseInt(endMonth) : null,
                endYear: endYear ? parseInt(endYear) : null,
                isRecurring: isRecurring !== undefined ? !!isRecurring : true,
                isActive: true
            }
        });

        return NextResponse.json({ success: true, contract: newContract });
    } catch (error) {
        console.error('Error creating billing contract:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}
