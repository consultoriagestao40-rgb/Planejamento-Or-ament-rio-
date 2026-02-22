import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to ensure database schema is up-to-date in production without manual migration
async function ensureSchema() {
  try {
    console.log("[SCHEMA] Checking for missing columns in BudgetEntry...");
    // Check if columns exist using Raw SQL (Postgres specific)
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='BudgetEntry' AND column_name='radarAmount') THEN
          ALTER TABLE "BudgetEntry" ADD COLUMN "radarAmount" DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='BudgetEntry' AND column_name='isLocked') THEN
          ALTER TABLE "BudgetEntry" ADD COLUMN "isLocked" BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);
    console.log("[SCHEMA] Schema check complete.");
  } catch (err) {
    console.error("[SCHEMA] Error insuring schema:", err);
  }
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const costCenterIdParam = searchParams.get('costCenterId') || 'DEFAULT';
    const costCenterIds = costCenterIdParam.split(',').map(id => id.trim()).filter(Boolean);

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

    const aggregatedBudgets = budgets.reduce((acc, curr: any) => {
      const key = `${curr.categoryId}-${curr.month}`;
      if (!acc[key]) {
        acc[key] = {
          categoryId: curr.categoryId,
          month: curr.month,
          year: curr.year,
          amount: curr.amount || 0,
          radarAmount: curr.radarAmount || 0,
          isLocked: curr.isLocked || false
        };
      } else {
        acc[key].amount += curr.amount || 0;
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
    await ensureSchema();
    const body = await request.json();
    const entries = body.entries ? body.entries : [body];

    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: 'Empresa Padrão', cnpj: '00000000000000' }
      });
    }

    const results = [];
    for (const entry of entries) {
      const { categoryId, month, year, costCenterId } = entry;
      const targetCostCenterId = (costCenterId || "DEFAULT").split(',')[0] || "DEFAULT";

      console.log(`[API DEBUG] Attempting upsert for:`, {
        categoryId,
        month,
        year,
        targetCostCenterId,
        amount: entry.amount,
        radarAmount: entry.radarAmount,
        isLocked: entry.isLocked
      });

      try {
        const whereClause = {
          tenantId_categoryId_costCenterId_month_year: {
            tenantId: tenant.id,
            categoryId: categoryId,
            costCenterId: targetCostCenterId,
            month: parseInt(month.toString()),
            year: parseInt(year.toString())
          }
        };

        const updateData: any = {};
        if (entry.amount !== undefined) updateData.amount = parseFloat(entry.amount.toString());
        if (entry.radarAmount !== undefined) updateData.radarAmount = entry.radarAmount === null ? null : parseFloat(entry.radarAmount.toString());
        if (entry.isLocked !== undefined) updateData.isLocked = !!entry.isLocked;

        const createData: any = {
          tenantId: tenant.id,
          categoryId: categoryId,
          costCenterId: targetCostCenterId,
          month: parseInt(month.toString()),
          year: parseInt(year.toString()),
          amount: entry.amount !== undefined ? parseFloat(entry.amount.toString()) : 0,
          radarAmount: entry.radarAmount !== undefined && entry.radarAmount !== null ? parseFloat(entry.radarAmount.toString()) : null,
          isLocked: !!entry.isLocked
        };

        const budget = await (prisma.budgetEntry as any).upsert({
          where: whereClause,
          update: updateData,
          create: createData
        });

        console.log(`[API DEBUG] Success for Cat: ${categoryId}, Month: ${month}`);
        results.push(budget);
      } catch (err: any) {
        console.error(`[API DEBUG] FAILED entry Cat: ${categoryId}, Month: ${month}:`, err.message);
        throw new Error(`Erro na categoria ${categoryId}, mês ${month}: ${err.message}`);
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('[API CRITICAL ERROR]:', error.message);
    return NextResponse.json({
      success: false,
      error: 'Failed to save budget',
      details: error.message
    }, { status: 500 });
  }
}
