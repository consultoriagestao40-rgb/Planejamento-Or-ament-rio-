
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

    const isGeneralView = costCenterIds.includes('DEFAULT');

    const budgets = await prisma.budgetEntry.findMany({
      where: {
        tenantId: tenant.id,
        ...(isGeneralView ? {} : { costCenterId: { in: costCenterIds } })
      }
    });

    // Aggregate by categoryId and month
    const aggregatedBudgets = budgets.reduce((acc, curr) => {
      const key = `${curr.categoryId}-${curr.month}`;
      if (!acc[key]) {
        acc[key] = { ...curr };
        acc[key].radarAmount = curr.radarAmount || 0;
      } else {
        acc[key].amount += curr.amount;
        acc[key].radarAmount = (acc[key].radarAmount || 0) + (curr.radarAmount || 0);
        if (curr.isLocked) acc[key].isLocked = true;
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
    const entries = body.entries ? body.entries : [body];

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

    const results = [];
    for (const entry of entries) {
      const { categoryId, month, year, costCenterId } = entry;
      const targetCostCenterId = (costCenterId || "DEFAULT").split(',')[0] || "DEFAULT";

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
          amount: entry.amount !== undefined ? entry.amount : undefined,
          radarAmount: entry.radarAmount !== undefined ? entry.radarAmount : undefined,
          isLocked: entry.isLocked !== undefined ? entry.isLocked : undefined,
        },
        create: {
          tenantId: tenant.id,
          categoryId,
          costCenterId: targetCostCenterId,
          month,
          year,
          amount: entry.amount || 0,
          radarAmount: entry.radarAmount || 0,
          isLocked: entry.isLocked || false,
        }
      });
      results.push(budget);
    }

    return NextResponse.json({ success: true, data: results.length === 1 ? results[0] : results });
  } catch (error) {
    console.error('Error saving budget:', error);
    return NextResponse.json({ success: false, error: 'Failed to save budget' }, { status: 500 });
  }
}
