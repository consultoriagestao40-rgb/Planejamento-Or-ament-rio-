import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
        include: { 
            tenantAccess: true, 
            costCenterAccess: {
                include: { costCenter: true }
            } 
        }
      });
      if (dbUser) {
        allowedCostCenters = dbUser.costCenterAccess.map((c: any) => c.costCenterId);
        const tenantIdsFromTenants = dbUser.tenantAccess.map((t: any) => t.tenantId);
        const tenantIdsFromCCs = dbUser.costCenterAccess.map((c: any) => c.costCenter.tenantId);
        allowedTenants = Array.from(new Set([...tenantIdsFromTenants, ...tenantIdsFromCCs]));
      } else {
        allowedCostCenters = [];
        allowedTenants = [];
      }
    }



    const { searchParams } = new URL(request.url);
    const costCenterIdParam = searchParams.get('costCenterId') || 'DEFAULT';
    let costCenterIds = costCenterIdParam.split(',').map(id => id.trim()).filter(Boolean);

    // If GESTOR, and they are requesting specific CCs, ensure we permit the tenants of those CCs
    if (user.role === 'GESTOR' && costCenterIds.length > 0 && !costCenterIds.includes('DEFAULT')) {
        const targetCCs = await prisma.costCenter.findMany({
            where: { id: { in: costCenterIds } },
            select: { tenantId: true }
        });
        const extraTenants = targetCCs.map((cc: any) => cc.tenantId);
        if (allowedTenants) {
            allowedTenants = Array.from(new Set([...allowedTenants, ...extraTenants]));
        }
    }

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
    const tenantIds = tenantIdParam !== 'ALL' ? tenantIdParam.split(',').map(t => t.trim()).filter(Boolean) : [];

    let tenantFilter: any = {};
    if (tenantIdParam !== 'ALL' && tenantIds.length > 0) {
      // If GESTOR, ensure they only query tenants they have access to
      if (user.role === 'GESTOR' && allowedTenants !== null) {
          const validTenants = tenantIds.filter(id => allowedTenants.includes(id));
          if (validTenants.length === 0) {
             console.log("[GET] User has no access to target tenants");
             return NextResponse.json({ success: true, data: [] });
          }
          tenantFilter = { tenantId: { in: validTenants } };
      } else {
          tenantFilter = { tenantId: { in: tenantIds } };
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
    let ccFilter: any = {};
    if (isGeneralView && user.role === 'MASTER') {
      ccFilter = {};
    } else if (!isGeneralView) {
      // Find all IDs that share the same clean name as the selected costCenterIds
      const selectedCCs = await prisma.costCenter.findMany({
          where: { id: { in: costCenterIds } },
          select: { name: true, tenantId: true }
      });
      
          const normalizeName = (name: string) => 
               (name || '')
                   .toLowerCase()
                   .replace(/^\[inativo\]\s*/i, '')
                   .replace(/^encerrado\s*/i, '')
                   .replace(/[^a-z0-9]/g, '')
                   .trim();

          const allSynonymousIds = new Set<string>(costCenterIds);
          if (selectedCCs.length > 0) {
              const targetNorms = selectedCCs.map(cc => normalizeName(cc.name));
              const firstPartNames = selectedCCs.map(cc => (cc.name || '').split('-')[0].trim());
              
              const synonymousCCs = await prisma.costCenter.findMany({
                  where: {
                      tenantId: { in: selectedCCs.map(cc => cc.tenantId) },
                      OR: firstPartNames.map(n => ({ name: { contains: n } }))
                  },
                  select: { id: true, name: true }
              });
              
              synonymousCCs.forEach(cc => {
                  const cn = normalizeName(cc.name);
                  if (targetNorms.includes(cn)) {
                      allSynonymousIds.add(cc.id);
                  }
              });
          }

      ccFilter = { OR: [
        { costCenterId: { in: Array.from(allSynonymousIds) } },
        { costCenterId: null }
      ]};
    } else {
      // GESTOR general view: restricted to their CCs (costCenterIds already populated above)
      ccFilter = costCenterIds.length > 0
        ? { OR: [{ costCenterId: { in: costCenterIds } }, { costCenterId: null }] }
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


    let isCCLocked = false;
    if (!isGeneralView && costCenterIds.length === 1) {
      const ccId = costCenterIds[0];
      const targetCC = await prisma.costCenter.findUnique({
        where: { id: ccId },
        select: { tenantId: true }
      });
      
      const lockTenantId = targetCC?.tenantId || anyTenant?.id;

      const lock = await (prisma as any).costCenterLock.findUnique({
        where: {
          tenantId_costCenterId_year: {
            tenantId: lockTenantId,
            costCenterId: ccId,
            year: selectedYear
          }
        }
      });
      isCCLocked = lock?.isLocked || false;
    }

    // --- FETCH RADAR LOCKS ---
    const radarLocks = await (prisma as any).radarLock.findMany({
      where: {
        ...(tenantIdParam !== 'ALL' && tenantIds.length > 0 ? { tenantId: { in: tenantIds } } : {}),
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
        isLocked: b.isLocked || isCCLocked, // Use global lock as fallback
        observation: b.observation || null
      }));
      return NextResponse.json({ success: true, data: rawEntries, isCCLocked, radarLocks });
    }


    const aggregatedBudgets = budgets.reduce((acc: any, curr: any) => {
      const key = `${curr.categoryId}-${curr.month}`;
      if (!acc[key]) {
        acc[key] = { ...curr };
        if (isCCLocked) acc[key].isLocked = true;
      } else {
        acc[key].amount += curr.amount || 0;
        acc[key].radarAmount = (acc[key].radarAmount || 0) + (curr.radarAmount || 0);
        if (curr.isLocked || isCCLocked) acc[key].isLocked = true;
        
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

    return NextResponse.json({ success: true, data: Object.values(aggregatedBudgets), isCCLocked, radarLocks });


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
    let costCenterAccessMap: Record<string, string> = {};
    if (user.role === 'GESTOR') {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId as string },
        include: { tenantAccess: true, costCenterAccess: true }
      });
      if (dbUser) {
        allowedCostCenters = dbUser.costCenterAccess.map((c: any) => c.costCenterId);
        dbUser.costCenterAccess.forEach((c: any) => {
            costCenterAccessMap[c.costCenterId] = c.accessLevel;
        });
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
      try {
        const { categoryId, month, year, costCenterId, tenantId: entryTenantId } = entry;
        const currentTenantId = entryTenantId || targetTenantId;

        if (!currentTenantId || !categoryId) {
          console.error(`[API POST ERR] Skipping entry: missing tenantId or categoryId`, { entry });
          continue;
        }

        const rawCC = (costCenterId || "DEFAULT").split(',')[0];
        let targetCCId: string | null = (rawCC === 'DEFAULT') ? null : rawCC;

        // CRITICAL FIX: If targetCCId is actually the TenantId, treat as General (null)
        // This prevents foreign key constraint errors when saving from "Geral" views.
        if (targetCCId === currentTenantId) {
          targetCCId = null;
        }

        const dbMonth = parseInt(month.toString()) + 1;
        const dbYear = parseInt(year.toString());

        const updateData: any = {};
        if (entry.amount !== undefined) updateData.amount = parseFloat(entry.amount.toString() || "0");
        if (entry.radarAmount !== undefined) updateData.radarAmount = entry.radarAmount === null ? null : parseFloat(entry.radarAmount.toString() || "0");
        if (entry.isLocked !== undefined) updateData.isLocked = !!entry.isLocked;
        if (entry.observation !== undefined) updateData.observation = entry.observation || null;

        const budget = await prisma.budgetEntry.upsert({
          where: {
            tenantId_categoryId_costCenterId_month_year: {
              tenantId: currentTenantId,
              categoryId: categoryId,
              costCenterId: targetCCId as any,
              month: dbMonth,
              year: dbYear
            }
          },
          update: updateData,
          create: {
            tenantId: currentTenantId,
            categoryId: categoryId,
            costCenterId: targetCCId,
            month: dbMonth,
            year: dbYear,
            amount: updateData.amount || 0,
            radarAmount: updateData.radarAmount ?? null,
            isLocked: !!entry.isLocked,
            observation: entry.observation || null
          }
        });
        results.push(budget);
      } catch (err: any) {
        console.error(`[API POST ERR] entry loop:`, err.message);
        throw err;
      }
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (error: any) {
    console.error('[API POST CRITICAL ERROR]:', error.message);
    return NextResponse.json({
      success: false,
      error: 'Falha ao salvar dados do orçamento',
      details: error.message
    }, { status: 500 });
  }
}
