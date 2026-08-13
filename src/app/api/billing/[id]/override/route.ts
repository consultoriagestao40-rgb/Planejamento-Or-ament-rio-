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

        // Get or materialise contract
        const contract = await getOrCreateContract(id);
        if (!contract) {
            return NextResponse.json({ success: false, error: 'Contrato não encontrado' }, { status: 404 });
        }

        // 1. Create/update override
        const override = await prisma.billingOverride.upsert({
            where: {
                billingContractId_month_year: {
                    billingContractId: contract.id,
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
                billingContractId: contract.id,
                month: parseInt(month),
                year: parseInt(year),
                value: value !== undefined && value !== null ? parseFloat(value) : null,
                billingDay: billingDay !== undefined && billingDay !== null ? parseInt(billingDay) : null,
                dueDay: dueDay !== undefined && dueDay !== null ? parseInt(dueDay) : null,
                isCancelled: isCancelled !== undefined ? !!isCancelled : false
            }
        });

        // 2. Propagate value/cancel to BudgetEntry for this month/year/costCenter
        if (contract.costCenterId) {
            const category = await prisma.category.findFirst({
                where: { tenantId: contract.tenantId, type: { in: ['REVENUE', 'RECEITA'] }, parentId: null }
            }) || await prisma.category.findFirst({
                where: { tenantId: contract.tenantId, type: { in: ['REVENUE', 'RECEITA'] } }
            });

            if (category) {
                const revenueCats = await prisma.category.findMany({
                    where: { tenantId: contract.tenantId, type: { in: ['REVENUE', 'RECEITA'] } },
                    select: { id: true }
                });
                const revenueCatIds = revenueCats.map(c => c.id);

                // Clean existing revenue budgets for this month/year
                await prisma.budgetEntry.deleteMany({
                    where: {
                        tenantId: contract.tenantId,
                        costCenterId: contract.costCenterId,
                        month: parseInt(month),
                        year: parseInt(year),
                        categoryId: { in: revenueCatIds }
                    }
                });

                // Write new value if not cancelled
                if (!isCancelled && value !== undefined && value !== null && parseFloat(value) > 0) {
                    await prisma.budgetEntry.create({
                        data: {
                            tenantId: contract.tenantId,
                            categoryId: category.id,
                            costCenterId: contract.costCenterId,
                            month: parseInt(month),
                            year: parseInt(year),
                            amount: parseFloat(value)
                        }
                    });
                }
            }
        }

        return NextResponse.json({ success: true, override });
    } catch (error: any) {
        console.error('Error creating/updating billing override:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor', details: error.message }, { status: 500 });
    }
}
