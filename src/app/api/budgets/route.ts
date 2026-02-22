
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const costCenterIdParam = searchParams.get('costCenterId') || 'DEFAULT';
    const costCenterIds = costCenterIdParam.split(',').map(id => id.trim()).filter(Boolean);

    // For prototype, just grab the first tenant
    const tenant = await prisma.tenant.findFirst();

    if (!tenant) {
      return NextResponse.json({ success: true, data: [] });
    }

    const budgets = await prisma.budgetEntry.findMany({
      where: {
        tenantId: tenant.id,
        costCenterId: { in: costCenterIds }
      }
    });

    // Aggregate by categoryId and month
    const aggregatedBudgets = budgets.reduce((acc, curr) => {
      const key = `${curr.categoryId}-${curr.month}`;
      if (!acc[key]) {
        acc[key] = { ...curr };
      } else {
        acc[key].amount += curr.amount;
      }
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ success: true, data: Object.values(aggregatedBudgets) });
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { categoryId, month, year, amount, costCenterId } = body;
    const costCenterIds = (costCenterId || "DEFAULT").split(',').map((id: string) => id.trim()).filter(Boolean);
    const targetCostCenterId = costCenterIds[0] || "DEFAULT";

    // For prototype, find or create a default tenant
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Empresa Padrão',
          cnpj: '00000000000000',
        }
      });
    }

    const budget = await prisma.budgetEntry.upsert({
      where: {
        tenantId_categoryId_costCenterId_month_year: {
          tenantId: tenant.id,
          categoryId,
          costCenterId: targetCostCenterId,
          month,
          year
        }
      },
      update: {
        amount,
      },
      create: {
        tenantId: tenant.id,
        categoryId,
        costCenterId: targetCostCenterId,
        month,
        year,
        amount
      }
    });

    return NextResponse.json({ success: true, data: budget });
  } catch (error) {
    console.error('Error saving budget:', error);
    return NextResponse.json({ success: false, error: 'Failed to save budget' }, { status: 500 });
  }
}
