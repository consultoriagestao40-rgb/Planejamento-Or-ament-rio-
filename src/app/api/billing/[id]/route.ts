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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role === 'EXTERNO') {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const {
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
            isRecurring,
            isActive
        } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (clientData !== undefined) updateData.clientData = clientData;
        if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
        if (billingDay !== undefined) updateData.billingDay = parseInt(billingDay);
        if (paymentTermDays !== undefined) updateData.paymentTermDays = parseInt(paymentTermDays);
        if (value !== undefined) updateData.value = parseFloat(value);
        if (startMonth !== undefined) updateData.startMonth = parseInt(startMonth);
        if (startYear !== undefined) updateData.startYear = parseInt(startYear);
        if (endMonth !== undefined) updateData.endMonth = endMonth ? parseInt(endMonth) : null;
        if (endYear !== undefined) updateData.endYear = endYear ? parseInt(endYear) : null;
        if (isRecurring !== undefined) updateData.isRecurring = !!isRecurring;
        if (isActive !== undefined) updateData.isActive = !!isActive;

        const updated = await prisma.billingContract.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({ success: true, contract: updated });
    } catch (error) {
        console.error('Error updating billing contract:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role === 'EXTERNO') {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const { id } = await params;

        // Cascade delete is handled by database thanks to onDelete: Cascade on Prisma
        await prisma.billingContract.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting billing contract:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}
