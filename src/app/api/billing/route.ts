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
        const tenantId = searchParams.get('tenantId') || 'ALL';
        const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();

        // 1. Resolve target tenant IDs based on role & filter
        let targetTenantIds: string[] = [];
        if (tenantId === 'ALL') {
            if (user.role === 'GESTOR') {
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.userId as string },
                    include: { tenantAccess: true }
                });
                targetTenantIds = dbUser?.tenantAccess.map(t => t.tenantId) || [];
            } else {
                const allTenants = await prisma.tenant.findMany({ select: { id: true } });
                targetTenantIds = allTenants.map(t => t.id);
            }
        } else {
            targetTenantIds = [tenantId];
        }

        if (targetTenantIds.length === 0) {
            return NextResponse.json({ success: true, contracts: [] });
        }

        // 2. Fetch all REVENUE categories for these tenants
        const revenueCategories = await prisma.category.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                type: 'REVENUE'
            },
            select: { id: true }
        });
        const revenueCatIds = revenueCategories.map(c => c.id);

        // 3. Fetch all budget entries for these categories
        const budgetEntries = await prisma.budgetEntry.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                year,
                categoryId: { in: revenueCatIds },
                costCenterId: { not: null }
            }
        });

        // Get unique costCenterIds that have budgets
        const budgetedCCIds = Array.from(new Set(budgetEntries.map(b => b.costCenterId as string)));

        // 4. Fetch all billing contracts configuration for these tenants
        const billingContracts = await prisma.billingContract.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                isActive: true
            },
            include: {
                overrides: {
                    where: {
                        year
                    }
                }
            }
        });

        const configuredCCIds = billingContracts.map(c => c.costCenterId).filter(Boolean) as string[];

        // Combine CC IDs: either budgeted or configured
        const ccIdsToLoad = Array.from(new Set([...budgetedCCIds, ...configuredCCIds]));

        // 5. Load those cost centers
        const costCenters = await prisma.costCenter.findMany({
            where: {
                id: { in: ccIdsToLoad }
            },
            include: {
                tenant: { select: { name: true } }
            }
        });

        // 6. Map each Cost Center as a contract entry
        const mappedContracts = costCenters.map(cc => {
            const config = billingContracts.find(bc => bc.costCenterId === cc.id);

            const monthlyBudgets = Array.from({ length: 12 }, (_, i) => {
                const month = i + 1;
                const entries = budgetEntries.filter(b => b.costCenterId === cc.id && b.month === month);
                return entries.reduce((sum, e) => sum + e.amount, 0);
            });

            return {
                id: config?.id || `virtual-${cc.id}`,
                costCenterId: cc.id,
                costCenterName: cc.name,
                tenantId: cc.tenantId,
                tenantName: cc.tenant.name,
                name: cc.name, // Display name
                clientData: config?.clientData || null,
                paymentMethod: config?.paymentMethod || 'Boleto',
                billingDay: config?.billingDay || 5,
                paymentTermDays: config?.paymentTermDays || 10,
                value: config?.value || monthlyBudgets[new Date().getMonth()] || 0,
                startMonth: config?.startMonth || 1,
                startYear: config?.startYear || year,
                endMonth: config?.endMonth || null,
                endYear: config?.endYear || null,
                isRecurring: config?.isRecurring ?? true,
                isActive: config?.isActive ?? true,
                overrides: config?.overrides || [],
                monthlyBudgets
            };
        });

        return NextResponse.json({ success: true, contracts: mappedContracts });
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
            isRecurring,
            costCenterId
        } = body;

        if (!tenantId || !name || !paymentMethod || billingDay === undefined || paymentTermDays === undefined || value === undefined || !startMonth || !startYear) {
            return NextResponse.json({ success: false, error: 'Campos obrigatórios ausentes' }, { status: 400 });
        }

        // 1. Resolve or create Cost Center if not provided
        let targetCCId = costCenterId || null;
        if (!targetCCId) {
            const newCC = await prisma.costCenter.create({
                data: {
                    id: `${tenantId}:${name.toUpperCase().trim().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`,
                    name: name,
                    tenantId
                }
            });
            targetCCId = newCC.id;
        }

        // 2. Create Billing Contract
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
                isActive: true,
                costCenterId: targetCCId
            }
        });

        // 3. Populate budgets in BudgetEntry for revenue
        const category = await prisma.category.findFirst({
            where: { tenantId, type: 'REVENUE', parentId: null }
        }) || await prisma.category.findFirst({
            where: { tenantId, type: 'REVENUE' }
        });

        if (category) {
            const revenueCats = await prisma.category.findMany({
                where: { tenantId, type: 'REVENUE' },
                select: { id: true }
            });
            const revenueCatIds = revenueCats.map(c => c.id);

            if (isRecurring) {
                // Populate all months
                const budgetData = Array.from({ length: 12 }, (_, i) => ({
                    tenantId,
                    categoryId: category.id,
                    costCenterId: targetCCId,
                    month: i + 1,
                    year: parseInt(startYear),
                    amount: parseFloat(value)
                }));
                
                await prisma.budgetEntry.deleteMany({
                    where: {
                        tenantId,
                        costCenterId: targetCCId,
                        year: parseInt(startYear),
                        categoryId: { in: revenueCatIds }
                    }
                });

                await prisma.budgetEntry.createMany({ data: budgetData });
            } else {
                // One-off
                await prisma.budgetEntry.create({
                    data: {
                        tenantId,
                        categoryId: category.id,
                        costCenterId: targetCCId,
                        month: parseInt(startMonth),
                        year: parseInt(startYear),
                        amount: parseFloat(value)
                    }
                });
            }
        }

        return NextResponse.json({ success: true, contract: newContract });
    } catch (error) {
        console.error('Error creating billing contract:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}
