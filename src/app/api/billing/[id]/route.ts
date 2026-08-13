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

async function getOrCreateContract(id: string) {
    if (!id.startsWith('virtual-')) {
        return await prisma.billingContract.findUnique({ where: { id } });
    }

    const costCenterId = id.replace('virtual-', '');
    let contract = await prisma.billingContract.findFirst({
        where: { costCenterId },
        include: { overrides: true }
    });

    if (!contract) {
        const cc = await prisma.costCenter.findUnique({
            where: { id: costCenterId },
            include: { tenant: true }
        });
        if (!cc) throw new Error('Centro de custo não encontrado');

        contract = await prisma.billingContract.create({
            data: {
                tenantId: cc.tenantId,
                name: cc.name,
                costCenterId: cc.id,
                paymentMethod: 'Boleto',
                billingDay: 5,
                paymentTermDays: 10,
                value: 0,
                startMonth: 1,
                startYear: new Date().getFullYear(),
                isRecurring: true,
                isActive: true
            },
            include: { overrides: true }
        });
    }

    return contract;
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

        // Resolve or create contract from virtual/real ID
        const contract = await getOrCreateContract(id);
        if (!contract) {
            return NextResponse.json({ success: false, error: 'Contrato não encontrado' }, { status: 404 });
        }

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
            where: { id: contract.id },
            data: updateData
        });

        // If value was modified, propagate it to BudgetEntries for revenue
        if (value !== undefined && contract.costCenterId) {
            const category = await prisma.category.findFirst({
                where: { tenantId: contract.tenantId, type: 'REVENUE', parentId: null }
            }) || await prisma.category.findFirst({
                where: { tenantId: contract.tenantId, type: 'REVENUE' }
            });

            if (category) {
                const revenueCats = await prisma.category.findMany({
                    where: { tenantId: contract.tenantId, type: 'REVENUE' },
                    select: { id: true }
                });
                const revenueCatIds = revenueCats.map(c => c.id);
                const targetYear = startYear ? parseInt(startYear) : contract.startYear;

                // Delete old revenue budgets for this cost center in the year
                await prisma.budgetEntry.deleteMany({
                    where: {
                        tenantId: contract.tenantId,
                        costCenterId: contract.costCenterId,
                        year: targetYear,
                        categoryId: { in: revenueCatIds }
                    }
                });

                if (parseFloat(value) > 0) {
                    // Re-populate all 12 months
                    const budgetData = Array.from({ length: 12 }, (_, i) => ({
                        tenantId: contract.tenantId,
                        categoryId: category.id,
                        costCenterId: contract.costCenterId as string,
                        month: i + 1,
                        year: targetYear,
                        amount: parseFloat(value)
                    }));
                    await prisma.budgetEntry.createMany({ data: budgetData });
                }
            }
        }

        return NextResponse.json({ success: true, contract: updated });
    } catch (error: any) {
        console.error('Error updating billing contract:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor', details: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role === 'EXTERNO') {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const { id } = await params;

        if (id.startsWith('virtual-')) {
            const costCenterId = id.replace('virtual-', '');
            // Simply delete the revenue budget entries for this cost center
            const cc = await prisma.costCenter.findUnique({
                where: { id: costCenterId }
            });
            if (cc) {
                const revenueCats = await prisma.category.findMany({
                    where: { tenantId: cc.tenantId, type: 'REVENUE' },
                    select: { id: true }
                });
                const revenueCatIds = revenueCats.map(c => c.id);

                await prisma.budgetEntry.deleteMany({
                    where: {
                        costCenterId: cc.id,
                        categoryId: { in: revenueCatIds }
                    }
                });
            }
        } else {
            const contract = await prisma.billingContract.findUnique({
                where: { id }
            });

            if (contract && contract.costCenterId) {
                const revenueCats = await prisma.category.findMany({
                    where: { tenantId: contract.tenantId, type: 'REVENUE' },
                    select: { id: true }
                });
                const revenueCatIds = revenueCats.map(c => c.id);

                await prisma.budgetEntry.deleteMany({
                    where: {
                        costCenterId: contract.costCenterId,
                        categoryId: { in: revenueCatIds }
                    }
                });
            }

            await prisma.billingContract.delete({
                where: { id }
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting billing contract:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}
