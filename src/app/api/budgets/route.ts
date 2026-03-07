import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

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
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    let allowedCostCenters: string[] | null = null;
    let allowedTenants: string[] | null = null;
    if (user.role === 'GESTOR') {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId as string },
        include: { tenantAccess: true, costCenterAccess: true }
      });
      if (dbUser) {
        allowedCostCenters = dbUser.costCenterAccess.map((c: any) => c.costCenterId);
        allowedTenants = dbUser.tenantAccess.map((t: any) => t.tenantId);
      } else {
        allowedCostCenters = [];
        allowedTenants = [];
      }
    }

    const { searchParams } = new URL(request.url);
    const costCenterIdParam = searchParams.get('costCenterId') || 'DEFAULT';
    let costCenterIds = costCenterIdParam.split(',').map(id => id.trim()).filter(Boolean);

    const isGeneralView = costCenterIds.includes('DEFAULT');

    if (user.role === 'GESTOR') {
      if (isGeneralView) {
        costCenterIds = allowedCostCenters || []; // Restrict general view to allowed CCs
      } else {
        // Intersect requested CCs with allowed CCs
        costCenterIds = costCenterIds.filter(id => allowedCostCenters?.includes(id));
      }
      if (costCenterIds.length === 0 && !isGeneralView) {
        return NextResponse.json({ success: true, data: [] }); // User requested CCs they don't have access to
      }
    }

    const tenantIdParam = searchParams.get('tenantId') || 'ALL';

    let tenantFilter: any = {};
    if (tenantIdParam !== 'ALL') {
      tenantFilter = { tenantId: tenantIdParam };
      if (user.role === 'GESTOR' && allowedTenants !== null && !allowedTenants.includes(tenantIdParam)) {
        console.log("[GET] User has no access to target tenant", tenantIdParam);
        return NextResponse.json({ success: true, data: [] });
      }
    } else {
      if (user.role === 'GESTOR' && allowedTenants !== null) {
        tenantFilter = { tenantId: { in: allowedTenants } };
      }
      // If MASTER, leave tenantFilter as {} to allow all
    }

    // Check if we even have any tenants connected
    const anyTenant = await prisma.tenant.findFirst();
    if (!anyTenant) {
      console.log("[GET] No tenants connected");
      return NextResponse.json({ success: true, data: [] });
    }

    // Build the costCenter filter:
    // - MASTER + isGeneralView → no filter at all (fetch everything)
    // - MASTER + specific CCs → filter by those CCs
    // - GESTOR + any view → filter by their allowed CCs (handled above)
    let ccFilter: any = {};
    if (isGeneralView && user.role === 'MASTER') {
      // No CC filter — return all entries for the selected tenant(s)
      ccFilter = {};
    } else if (!isGeneralView) {
      ccFilter = { costCenterId: { in: costCenterIds } };
    } else {
      // GESTOR general view: restricted to their CCs (costCenterIds already populated above)
      ccFilter = costCenterIds.length > 0
        ? { costCenterId: { in: costCenterIds } }
        : {};
    }

    const selectedYear = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    
    const budgets = await prisma.budgetEntry.findMany({
      where: {
        ...tenantFilter,
        ...ccFilter,
        year: selectedYear
      }
    });


    const isDetailMode = searchParams.get('detail') === 'true';

    // In detail mode, return raw entries with tenantId + costCenterId for the drill-down modal
    if (isDetailMode) {
      const rawEntries = budgets.map((b: any) => ({
        categoryId: b.categoryId,
        tenantId: b.tenantId,
        costCenterId: b.costCenterId,
        month: b.month,
        year: b.year,
        amount: b.amount || 0,
        radarAmount: b.radarAmount,
        isLocked: b.isLocked || false,
        observation: b.observation || null
      }));
      return NextResponse.json({ success: true, data: rawEntries });
    }

    const aggregatedBudgets = budgets.reduce((acc, curr: any) => {
      const key = `${curr.categoryId}-${curr.month}`;
      if (!acc[key]) {
        acc[key] = { ...curr };
      } else {
        acc[key].amount += curr.amount || 0;
        acc[key].radarAmount = (acc[key].radarAmount || 0) + (curr.radarAmount || 0);
        if (curr.isLocked) acc[key].isLocked = true;
        
        // IMPROVEMENT: Join observations/comments with newlines if they differ
        if (curr.observation && curr.observation.trim()) {
          if (!acc[key].observation) {
            acc[key].observation = curr.observation;
          } else if (!acc[key].observation.includes(curr.observation)) {
            acc[key].observation = `${acc[key].observation}\n${curr.observation}`;
          }
        }
      }
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ success: true, data: Object.values(aggregatedBudgets) });

  } catch (error: any) {
    console.error('Error fetching budgets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch budgets', details: error.message }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    await ensureSchema();
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    let allowedCostCenters: string[] | null = null;
    let allowedTenants: string[] | null = null;
    if (user.role === 'GESTOR') {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId as string },
        include: { tenantAccess: true, costCenterAccess: true }
      });
      if (dbUser) {
        allowedCostCenters = dbUser.costCenterAccess.map((c: any) => c.costCenterId);
        allowedTenants = dbUser.tenantAccess.map((t: any) => t.tenantId);
      } else {
        allowedCostCenters = [];
        allowedTenants = [];
      }
    }

    const body = await request.json();
    const entries = body.entries ? body.entries : [body];

    let targetTenantId = body.tenantId
      // The frontend sends tenantId inside each entry, not at the body level.
      // So also check entries[0].tenantId as the primary source.
      || (entries[0]?.tenantId && entries[0].tenantId !== 'ALL' ? entries[0].tenantId : null);

    if (!targetTenantId || targetTenantId === 'ALL') {
      // Fallback: derive the correct tenant from the categoryId being saved.
      const firstEntry = entries[0];
      if (firstEntry?.categoryId) {
        const cat = await prisma.category.findUnique({ where: { id: firstEntry.categoryId }, select: { tenantId: true } });
        targetTenantId = cat?.tenantId || null;
      }
      if (!targetTenantId) {
        const firstTenant = await prisma.tenant.findFirst();
        targetTenantId = firstTenant?.id || null;
        if (!targetTenantId) {
          const newTenant = await prisma.tenant.create({ data: { name: 'Empresa Padrão', cnpj: '00000000000000' } });
          targetTenantId = newTenant.id;
        }
      }
    }

    if (user.role === 'GESTOR' && allowedTenants !== null && !allowedTenants.includes(targetTenantId)) {
      return NextResponse.json({ success: false, error: 'Sem acesso a esta empresa' }, { status: 403 });
    }

    const results = [];
    for (const entry of entries) {
      const { categoryId, month, year, costCenterId } = entry;
      // Convert 'DEFAULT' sentinel to null — there is no CostCenter with id='DEFAULT' in the DB.
      // The BudgetEntry.costCenterId is optional (String?) so null is valid.
      const rawCostCenterId = (costCenterId || "DEFAULT").split(',')[0] || "DEFAULT";
      const targetCostCenterId: string | null = (rawCostCenterId === 'DEFAULT') ? null : rawCostCenterId;

      if (user.role === 'GESTOR' && targetCostCenterId !== null && allowedCostCenters !== null && !allowedCostCenters.includes(targetCostCenterId)) {
        console.warn(`[API POST] User ${user.email} denied access to save on CC ${targetCostCenterId}`);
        continue; // Skip unauthorized entries
      }

      // Check for Global Cost Center Lock
      const globalLock = await (prisma as any).costCenterLock.findUnique({
        where: {
          tenantId_costCenterId_year: {
            tenantId: targetTenantId,
            costCenterId: targetCostCenterId || 'DEFAULT',
            year: parseInt(year.toString())
          }
        }
      });

      if (globalLock?.isLocked) {
        return NextResponse.json({ 
          success: false, 
          error: `O orçamento do centro de custo ${targetCostCenterId || 'Geral'} está bloqueado para o ano ${year}.` 
        }, { status: 403 });
      }


      // Convert to 1-indexed for DB (1-12)
      const dbMonth = parseInt(month.toString()) + 1;

      console.log(`[API POST] Upserting Cat: ${categoryId}, Tenant: ${targetTenantId}, CC: ${targetCostCenterId}, Month: ${dbMonth}`);

      try {
        const whereClause = {
          tenantId_categoryId_costCenterId_month_year: {
            tenantId: targetTenantId,
            categoryId: categoryId,
            costCenterId: targetCostCenterId,
            month: dbMonth,
            year: parseInt(year.toString())
          }
        };

        const updateData: any = {};
        if (entry.amount !== undefined) updateData.amount = parseFloat(entry.amount.toString() || "0");
        if (entry.radarAmount !== undefined) updateData.radarAmount = entry.radarAmount === null ? null : parseFloat(entry.radarAmount.toString() || "0");
        if (entry.isLocked !== undefined) updateData.isLocked = !!entry.isLocked;
        if (entry.observation !== undefined) updateData.observation = entry.observation || null;

        const createData: any = {
          tenantId: targetTenantId,
          categoryId: categoryId,
          costCenterId: targetCostCenterId,
          month: dbMonth,
          year: parseInt(year.toString()),
          amount: entry.amount !== undefined ? parseFloat(entry.amount.toString() || "0") : 0,
          radarAmount: entry.radarAmount !== undefined && entry.radarAmount !== null ? parseFloat(entry.radarAmount.toString() || "0") : null,
          isLocked: !!entry.isLocked,
          observation: entry.observation || null
        };

        const budget = await (prisma.budgetEntry as any).upsert({
          where: whereClause,
          update: updateData,
          create: createData
        });
        results.push(budget);
      } catch (err: any) {
        console.error(`[API POST ERR] Cat ${categoryId}:`, err.message);
        throw err;
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('[API POST CRITICAL]:', error.message);
    return NextResponse.json({
      success: false,
      error: 'Failed to save budget',
      details: error.message
    }, { status: 500 });
  }
}
