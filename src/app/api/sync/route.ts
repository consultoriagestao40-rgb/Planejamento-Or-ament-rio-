import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantIdParam = searchParams.get('tenantId') || 'ALL';
        const inputIds = tenantIdParam !== 'ALL' ? tenantIdParam.split(',').map(t => t.trim()).filter(Boolean) : [];

        // Deduplicate using unified logic
        const allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
        
        let targetTenantIds: string[] = [];
        if (tenantIdParam === 'ALL') {
             targetTenantIds = allTenants.map((t: any) => t.id);
        } else {
            // Support searching by any ID but returning variants of it
            const inputIds = tenantIdParam.split(',').map(t => t.trim()).filter(Boolean);
            for (const id of inputIds) {
                const t = allTenants.find((ten: any) => ten.id === id);
                if (t) {
                    const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
                    
                    allTenants.forEach((ten: any) => {
                        const kn = (ten.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const kc = (ten.cnpj || '').replace(/\D/g, '');
                        // Stricter matching: CNPJ must match if both present, or name must match exactly.
                        const cnpjMatch = (cleanCnpj && kc) ? (cleanCnpj === kc) : true;
                        if (kn === cleanName && cnpjMatch) {
                            if (!targetTenantIds.includes(ten.id)) targetTenantIds.push(ten.id);
                        }
                    });
                }
            }
        }

        const ccs = costCenterId.split(',').filter(id => id !== 'DEFAULT');

        // Query entries for ALL variant IDs
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                year,
                viewMode
            }
        });

        const categories = await prisma.category.findMany({
            where: { tenantId: { in: targetTenantIds } },
            select: { id: true, name: true }
        });

        const categoryMap = new Map<string, string>();
        categories.forEach((c: any) => {
            const rawId = c.id.includes(':') ? c.id.split(':')[1] : c.id;
            categoryMap.set(rawId, c.name);
            categoryMap.set(c.id, c.name);
        });

        // Create a map of name -> ID for the Grid key
        // We use the first ID we find for that name, but aggregate everything for that name.
        const nameToKey = new Map<string, string>();
        const nameToTotal = new Map<string, number>();

        for (const entry of entries) {
            if (ccs.length > 0 && (!entry.costCenterId || !ccs.includes(entry.costCenterId))) continue;

            const entryRawCatId = entry.categoryId.includes(':') ? entry.categoryId.split(':')[1] : entry.categoryId;
            const baseCatName = (categoryMap.get(entryRawCatId) || categoryMap.get(entry.categoryId) || 'Sem Categoria').trim();
            const monthKey = `${baseCatName}-${entry.month - 1}`;
            nameToTotal.set(monthKey, (nameToTotal.get(monthKey) || 0) + (entry.amount || 0));
        }

        // Now map the aggregated totals to the ACTUAL IDs the Grid is using.
        // The Grid uses IDs from the setup, so we map NAME -> ALL IDs we found for it.
        const aggregatedValues: Record<string, number> = {};
        categories.forEach((c: any) => {
            const name = (c.name || '').trim();
            for (let m = 0; m < 12; m++) {
                const monthKey = `${name}-${m}`;
                if (nameToTotal.has(monthKey)) {
                    aggregatedValues[`${c.id}-${m}`] = nameToTotal.get(monthKey)!;
                }
            }
        });

        return NextResponse.json({
            success: true,
            realizedValues: aggregatedValues,
            data: { success: true, timestamp: new Date().toISOString() } 
        });


    } catch (error: any) {
        console.error('Critical Sync route failure:', error);
        return NextResponse.json({ success: false, error: error.message || 'Fatal error during DB read' }, { status: 500 });
    }
}

