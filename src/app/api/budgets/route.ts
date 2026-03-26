import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;


export async function GET(request: Request) {
  try {
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
                    .replace(/^[0-9. ]+/, '') // Remove leading codes like "271.225 "
                    .replace(/[^a-z0-9]/g, '')
                    .replace(/merces/g, 'meces') // Fix Mercês/Mecês typo
                    .trim();
 
           const allSynonymousIds = new Set<string>(costCenterIds);
           if (selectedCCs.length > 0) {
               const targetNorms = selectedCCs.map(cc => normalizeName(cc.name));
               
               const synonymousCCs = await prisma.costCenter.findMany({
                   where: {
                       tenantId: { in: selectedCCs.map(cc => cc.tenantId) } // Use selectedCCs' tenantIds for initial search
                   },
                   select: { id: true, name: true, tenantId: true }
               });
               
               synonymousCCs.forEach(cc => {
                   const cn = normalizeName(cc.name);
                   if (targetNorms.some(tn => cn.includes(tn) || tn.includes(cn))) {
                       allSynonymousIds.add(cc.id);
                   }
               });
           }

      ccFilter = { costCenterId: { in: Array.from(allSynonymousIds) } };
    } else {
      // GESTOR general view: restricted to their CCs (costCenterIds already populated above)
      ccFilter = costCenterIds.length > 0
        ? { OR: [{ costCenterId: { in: costCenterIds } }, { costCenterId: null }] }
        : {};
    }

    // --- CATEGORY EXPANSION (v66.11: FIX TOTAL CONSISTENCY - Hierarchy + Synonyms) ---
    const categoryIdParam = searchParams.get('categoryId');
    const monthParamStr = searchParams.get('month');
    const monthParam = monthParamStr ? parseInt(monthParamStr) : undefined;
    // v66.17: Strip 'synth-' prefix sent by the grid modal to find the real categories
    let categoryIdsSelected: string[] = categoryIdParam 
        ? categoryIdParam.split(',').map(id => id.replace(/^synth-/, '')).filter(Boolean) 
        : [];
    let allSynonymousCategoryIds: string[] = [];
    
    if (categoryIdsSelected.length > 0) {
        // 1. Get all categories for tree traversal
        const allCats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
        
        // 2. Recursive expansion helper
        const getDescendants = (ids: string[]): string[] => {
            const children = allCats.filter(c => c.parentId && ids.includes(c.parentId)).map(c => c.id);
            if (children.length === 0) return ids;
            const subDesc = getDescendants(children);
            return Array.from(new Set([...ids, ...subDesc]));
        };
        
        // v66.14-19: Ultra-Resilient Category Search for Grouped/Synthetic IDs
        const normalizeCode = (c: string) => c.split('.').map(s => parseInt(s, 10).toString()).filter(s => s !== 'NaN').join('.');

        const seedIds = allCats
            .filter(c => {
                const isIdMatch = categoryIdsSelected.some(pid => c.id === pid || c.id === pid.replace(/^synth-/, ''));
                
                const isNameMatch = categoryIdsSelected.some(pid => {
                    const cleanPid = pid.replace(/^synth-/, '');
                    const normPid = normalizeCode(cleanPid);
                    const catName = (c.name || '');
                    
                    // Match by code prefix in name (e.g. "01.1 - ...")
                    const matchPrefix = catName.match(/^([\d.]+)/);
                    if (matchPrefix) {
                        const normCat = normalizeCode(matchPrefix[1]);
                        // v66.20: Fixed - Use startsWith to catch children (e.g. 1.1.1) when clicking a parent (1.1)
                        return normCat === normPid || normCat.startsWith(normPid + '.');
                    }
                    return catName.startsWith(cleanPid) || catName.includes(cleanPid);
                });
                return isIdMatch || isNameMatch;
            })
            .map(c => c.id);

        const expandedIds = getDescendants(seedIds.length > 0 ? seedIds : categoryIdsSelected);
        const expandedCats = allCats.filter(c => expandedIds.includes(c.id));
        
        // 3. Collect base names of all categories in the tree (target + children)
        const targetBaseNames = new Set(expandedCats.map(c => (c.name || '').split('-').pop()?.toUpperCase().trim()).filter(Boolean));
        
        // 4. Find all matching names across the DB (Synonyms for any category in the hierarchy)
        allSynonymousCategoryIds = allCats
            .filter(c => {
                const bName = (c.name || '').split('-').pop()?.toUpperCase().trim();
                return bName && targetBaseNames.has(bName);
            })
            .map(c => c.id);
            
        // Final fallback: ensure original expansion IDs are included
        expandedIds.forEach(id => {
            if (!allSynonymousCategoryIds.includes(id)) allSynonymousCategoryIds.push(id);
        });
    }

    const selectedYear = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // --- ULTRA ROBUST CC & TENANT EXPANSION (Matches Sync API) ---
    let allSynonymousIdsArr: string[] = [];
    let allVariantIdsArr: string[] = tenantIdParam !== 'ALL' ? tenantIds : [];

    if (!isGeneralView && costCenterIds.length > 0) {
        // 1. Get the base CCs and their tenants
        const baseCCs = await prisma.costCenter.findMany({
            where: { id: { in: costCenterIds } },
            include: { tenant: true }
        });

        if (baseCCs.length > 0) {
            // 2. Expand Tenant IDs by CNPJ
            const cnpjs = Array.from(new Set(baseCCs.map(cc => cc.tenant?.cnpj).filter(Boolean)));
            if (cnpjs.length > 0) {
                const variantTenants = await prisma.tenant.findMany({
                    where: { cnpj: { in: cnpjs as string[] } }
                });
                const variantIds = variantTenants.map(t => t.id);
                allVariantIdsArr = Array.from(new Set([...allVariantIdsArr, ...variantIds]));
            }

            // 3. Find ALL CCs in these variant tenants
            const potentialCCs = await prisma.costCenter.findMany({
                where: { tenantId: { in: allVariantIdsArr } }
            });

            // 4. Normalize and find synonyms
            const normalize = (name: string) => (name || '')
                .toLowerCase()
                .replace(/^[0-9. ]+/, '')
                .replace(/[^a-z0-9]/g, '')
                .replace(/merces/g, 'meces')
                .trim();

            const targetNorms = baseCCs.map(cc => normalize(cc.name));
            const synonyms = potentialCCs.filter(cc => {
                const cn = normalize(cc.name);
                return targetNorms.some(tn => cn.includes(tn) || tn.includes(cn));
            });

            allSynonymousIdsArr = synonyms.map(cc => cc.id);
        }
    }

    // Final Query with expanded IDs
    const budgetsRaw = await prisma.budgetEntry.findMany({
      where: {
        year: selectedYear,
        month: monthParam !== undefined ? monthParam : undefined,
        ...(allSynonymousCategoryIds.length > 0 ? { categoryId: { in: allSynonymousCategoryIds } } : {}),
        ...(allSynonymousIdsArr.length > 0 ? { costCenterId: { in: allSynonymousIdsArr } } : ccFilter),
        tenantId: { in: allVariantIdsArr.length > 0 ? allVariantIdsArr : (tenantIdParam === 'ALL' ? undefined : tenantIds) }
      },
      include: {
        category: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
        tenant: { select: { id: true, name: true } }
      }
    });

    // Helper for cost center normalization (mirroring frontend)
    const normalizeCC = (name: string) => (name || '')
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/^\[INATIVO\]\s*/i, '')
        .replace(/^[0-9.]+\s*-\s*/, '')
        .toUpperCase().trim();

    // --- ORPHAN RECOVERY LOGIC (Ultra Robust) ---
    // Load ALL categories from DB once to have a name-to-id mapping
    const allGlobalCategories = await prisma.category.findMany({ select: { id: true, name: true, tenantId: true } });
    const globalIdToName = new Map<string, string>();
    allGlobalCategories.forEach(c => globalIdToName.set(c.id, c.name));

    // Map names to "Preferred" IDs for the current view (those that belong to targetTenant or targetCC variants)
    // We'll use the first ID we find for each name among the 'valid' categories
    const nameToActiveId = new Map<string, string>();
    allGlobalCategories.forEach(c => {
        const normName = c.name.toUpperCase().trim();
        // Priority: current tenant's ID
        if (allVariantIdsArr.includes(c.tenantId)) {
            nameToActiveId.set(normName, c.id);
        } else if (!nameToActiveId.has(normName)) {
            nameToActiveId.set(normName, c.id);
        }
    });

    const mappedBudgets = budgetsRaw.map(b => {
        let entry = { ...b };
        const myCatName = b.category?.name || globalIdToName.get(b.categoryId);
        if (myCatName) {
            const normName = myCatName.toUpperCase().trim();
            const activeId = nameToActiveId.get(normName);
            if (activeId && activeId !== entry.categoryId) {
                // Remap to the primary ID representing this category name in the current view
                (entry as any).categoryId = activeId;
            }
        }
        return entry;
    });

    // --- v66.8: LOGICAL DEDUPLICATION BY NORMALIZED NAME ---
    // If we have multiple entries for the same Logical Category, Normalized CC Name, Month and Tenant, we pick only one.
    // This prevents doubling values when synonyms exist in the DB (active vs [INATIVO] ID).
    const dedupMap = new Map<string, any>();
    mappedBudgets.forEach(b => {
        const ccName = b.costCenter?.name || 'Geral';
        const normCCName = normalizeCC(ccName);
        const key = `${b.categoryId}-${normCCName}-${b.month}-${b.tenantId}`;
        
        if (!dedupMap.has(key)) {
            dedupMap.set(key, b);
        } else {
            const existing = dedupMap.get(key);
            const isExistingInativo = (existing.costCenter?.name || '').toUpperCase().includes('[INATIVO]');
            const isCurrentInativo = (ccName).toUpperCase().includes('[INATIVO]');
            
            // Prioritize [ATIVO] over [INATIVO] if they exist for the same logical unit
            if (isExistingInativo && !isCurrentInativo) {
                dedupMap.set(key, b);
            } else if ((b.amount || 0) > (existing.amount || 0) && (isExistingInativo === isCurrentInativo)) {
                // Otherwise prioritize the one with larger amount
                dedupMap.set(key, b);
            }
        }
    });

    const budgets = Array.from(dedupMap.values());

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

      if (isDetailMode) {
        const rawEntries = budgets.map((b: any) => ({
          categoryId: (categoryIdParam && categoryIdsSelected.length > 0)
            ? categoryIdsSelected[0] // v66.21: Use the requested ID (even if synthetic) to ensure modal aggregation
            : b.categoryId,
          tenantId: b.tenantId,
          costCenterId: b.costCenterId,
          month: b.month,
          year: b.year,
          amount: b.amount || 0,
          radarAmount: b.radarAmount,
          isLocked: b.isLocked || isCCLocked,
          observation: b.observation || null
        }));
        return NextResponse.json({ success: true, data: rawEntries, isCCLocked, radarLocks });
      }

    const aggregatedBudgets = budgets.reduce((acc: any, curr: any) => {
      // RESTORE TO 1-12 aggregation key (Frontend does -1)
      const key = `${curr.categoryId}-${curr.month}`;
      if (!acc[key]) {
        acc[key] = { ...curr };
        if (isCCLocked) acc[key].isLocked = true;
      } else {
        acc[key].amount += curr.amount || 0;
        acc[key].radarAmount = (acc[key].radarAmount || 0) + (curr.radarAmount || 0);
        if (curr.isLocked || isCCLocked) acc[key].isLocked = true;
        
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
      let currentTenantIdForDiag: string = targetTenantId;
      let finalCategoryIdForDiag: string = "unknown";
      try {
        const { categoryId: rawCategoryId, month, year, costCenterId, tenantId: entryTenantId } = entry;
        const incomingId = (rawCategoryId || "").toString().split(',')[0].trim();
        const currentTenantId = entryTenantId || targetTenantId;
        currentTenantIdForDiag = currentTenantId;

        if (!currentTenantId || !incomingId || incomingId === "null" || incomingId === "undefined") {
          console.error(`[API POST ERR] Skipping entry: missing tenantId or categoryId`, { incomingId, currentTenantId });
          continue;
        }

        // --- CATEGORY ID RECOVERY LOGIC (v64.6 - Ultra Robust) ---
        let finalCategoryId = incomingId;
        finalCategoryIdForDiag = incomingId;
        
        let existsForTenant = false;
        if (!incomingId.startsWith('synth-')) {
          const check = await prisma.category.findFirst({
              where: { id: incomingId, tenantId: currentTenantId }
          });
          if (check) {
            existsForTenant = true;
            finalCategoryId = check.id;
          }
        }

        if (!existsForTenant) {
            console.warn(`[RECOVERY] ID ${incomingId} not found or synthetic for Tenant ${currentTenantId}. Searching by name/code...`);
            
            // 1. Try to recover by name/code if we can find the source category globally
            const sourceCategory = !incomingId.startsWith('synth-') 
              ? await prisma.category.findFirst({ where: { id: incomingId } })
              : null;
            
            if (sourceCategory) {
                const recovery = await prisma.category.findFirst({
                    where: { name: sourceCategory.name, tenantId: currentTenantId }
                });
                if (recovery) {
                    console.log(`[RECOVERY] Found matching category ${recovery.id} by name "${sourceCategory.name}"`);
                    finalCategoryId = recovery.id;
                }
            }
            
            // 2. If still not found, try to match by code (e.g. from synth-02.1 or from source category)
            if (finalCategoryId === incomingId || incomingId.startsWith('synth-')) {
                let codeToMatch = "";
                if (incomingId.startsWith('synth-')) {
                    codeToMatch = incomingId.replace('synth-', '');
                } else if (sourceCategory) {
                    const match = sourceCategory.name.match(/^([\d.]+)/);
                    if (match) codeToMatch = match[1];
                }

                if (codeToMatch) {
                    // Normalize code (e.g. 02.1 -> 2.1)
                    const norm = (c: string) => c.split('.').map(s => parseInt(s, 10).toString()).filter(s => s !== 'NaN').join('.');
                    const targetCodeNorm = norm(codeToMatch);
                    
                    const allTenantCats = await prisma.category.findMany({ where: { tenantId: currentTenantId } });
                    const matchByCode = allTenantCats.find(c => {
                        const m = c.name.match(/^([\d.]+)/);
                        return m && norm(m[1]) === targetCodeNorm;
                    });

                    if (matchByCode) {
                        console.log(`[RECOVERY] Found matching category ${matchByCode.id} by code "${targetCodeNorm}"`);
                        finalCategoryId = matchByCode.id;
                    }
                }
            }

            // 3. Last resort: If it's a DAS/Tax related thing, find ANY tax category
            if (finalCategoryId === incomingId || incomingId.startsWith('synth-')) {
                const isTaxRelated = incomingId.includes('02.1') || incomingId.includes('2.1') || 
                                   (sourceCategory?.name || "").toUpperCase().includes('DAS') ||
                                   (sourceCategory?.name || "").toUpperCase().includes('TRIBUTO');
                
                if (isTaxRelated) {
                    const taxCat = await prisma.category.findFirst({
                        where: {
                            tenantId: currentTenantId,
                            OR: [
                                { name: { contains: 'DAS', mode: 'insensitive' } },
                                { name: { contains: 'TRIBUTO', mode: 'insensitive' } },
                                { name: { contains: 'IMPOSTO', mode: 'insensitive' } }
                            ]
                        }
                    });
                    if (taxCat) {
                        console.log(`[RECOVERY] Found tax category ${taxCat.id} as last resort`);
                        finalCategoryId = taxCat.id;
                    }
                }
            }

            // CRITICAL: If after all recovery we still have a synthetic ID, WE MUST NOT PROCEED with create
            if (finalCategoryId.startsWith('synth-')) {
                console.error(`[RECOVERY FAIL] Could not find any real category for synthetic ID ${incomingId}`);
                continue;
            }
        }
        finalCategoryIdForDiag = finalCategoryId;

        // 1. Robustly parse Cost Center ID
        const rawCC = (costCenterId || "").toString().trim();
        const parts = rawCC.split(':');
        // If combined "TENANT:CC", use CC. If plain CC, use CC. If empty, use null.
        const ccCandidate = parts.length > 1 ? parts[1].trim() : parts[0].trim();
        const firstCC = ccCandidate.split(',')[0].trim(); // Handle comma-synonyms

        const targetCCId: string | null = (
          !firstCC || 
          firstCC === 'DEFAULT' || 
          firstCC === 'null' || 
          firstCC === 'undefined' || 
          firstCC === currentTenantId
        ) ? null : firstCC;

        // 2. Safely parse values
        const dbMonth = parseInt(month.toString()) + 1;
        const dbYear = parseInt(year.toString());

        const updateData: any = {};
        // 1. CLEAR existing records for this specific Category, Month, Year, and CostCenter
        // This ensures NO DUPLICATES remain from previous imports or bugs.
        // ─── NUCLEAR CLEANUP ──────────────────────────────────────────
        // Descoberta: Registros fantasmas persistem porque estão vinculados a IDs que o Grid não conhece (órfãos de outros tenants).
        // Solução: Buscar o nome da categoria alvo e limpar TODOS os registros com esse nome ou IDs sinônimos.
        const targetCategory = await prisma.category.findUnique({ where: { id: finalCategoryId } });
        let idsToClean = [finalCategoryId];
        
        if (targetCategory) {
            const synonymousCategories = await prisma.category.findMany({
                where: { 
                    OR: [
                        { name: targetCategory.name },
                        { name: { contains: targetCategory.name.split('-').pop()?.trim() || 'XYZ_NEVER_MATCH' } }
                    ]
                },
                select: { id: true }
            });
            idsToClean = Array.from(new Set([...idsToClean, ...synonymousCategories.map(c => c.id)]));
        }

        console.log(`[POST] Nuclear Cleaning IDs: ${idsToClean.join(', ')} for Month: ${dbMonth}, CC: ${targetCCId}`);

        await prisma.budgetEntry.deleteMany({
          where: {
            categoryId: { in: idsToClean },
            costCenterId: targetCCId,
            month: dbMonth,
            year: dbYear
          }
        });

        // 2. CREATE the new entry if amount is not null/empty (effectively a zero-aware upsert)
        let budget;
        if (entry.amount !== undefined && entry.amount !== null) {
          budget = await prisma.budgetEntry.create({
            data: {
              categoryId: finalCategoryId,
              month: dbMonth,
              year: dbYear,
              amount: entry.amount ? parseFloat(entry.amount.toString()) : 0,
              observation: entry.observation || null,
              costCenterId: targetCCId,
              tenantId: currentTenantId,
              isLocked: !!entry.isLocked,
              radarAmount: (entry.radarAmount !== undefined && entry.radarAmount !== null) ? parseFloat(entry.radarAmount.toString()) : null,
            }
          });
        } else {
          // If amount is null/undefined, it means we want to effectively "delete" the entry
          // or set it to zero, which is handled by the deleteMany above.
          // We don't create a new entry if the amount is not provided.
          // For consistency, we can push a "null" or "deleted" status to results if needed,
          // but for now, we just skip creating.
          budget = null; 
        }
        if (budget) {
          results.push(budget);
        }
      } catch (err: any) {
        console.error(`[API POST ERR] Loop entry failure:`, err.message);
        const diagErr: any = new Error(err.message);
        diagErr._lastTenantId = currentTenantIdForDiag;
        diagErr._lastCategoryId = finalCategoryIdForDiag;
        throw diagErr;
      }
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (error: any) {
    console.error('[API POST CRITICAL ERROR]:', error.message);
    return NextResponse.json({
      success: false,
      error: 'Falha ao salvar dados do orçamento',
      details: error.message,
      debug: {
        lastAttempt: {
           tenantId: error?._lastTenantId || 'unknown',
           categoryId: error?._lastCategoryId || 'unknown'
        }
      }
    }, { status: 500 });
  }
}
