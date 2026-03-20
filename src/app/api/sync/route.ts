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

        // Deduplicate and pick Primary IDs for each company group using unified logic
        const { getTenantGroups } = await import('@/lib/tenant-utils');
        const allTenants = await prisma.tenant.findMany({ select: { id: true, cnpj: true } });
        const tenantGroups = await getTenantGroups();

        let allVariantIds: string[] = [];

        if (tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT') {
            allVariantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
            const selectedTenants = allTenants.filter(t => requestedIds.includes(t.id));
            const getBaseCnpj = (cnpj: string) => (cnpj || '').replace(/\D/g, '').substring(0, 8);
            const bases = new Set(selectedTenants.map(t => getBaseCnpj(t.cnpj)).filter(b => b.length === 8));
            
            allVariantIds = allTenants.filter(t => {
                if (requestedIds.includes(t.id)) return true;
                const b = getBaseCnpj(t.cnpj);
                return b.length === 8 && bases.has(b);
            }).map(t => t.id);
        }

        // Deduplicate
        allVariantIds = Array.from(new Set(allVariantIds));

        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: allVariantIds },
                year,
                viewMode
            }
        });

        const categories = await prisma.category.findMany({
            where: { tenantId: { in: allVariantIds } },
            select: { id: true, name: true }
        });

        const categoryNameMap = new Map<string, string>();
        categories.forEach(c => {
            // Map the FULL ID to the name
            categoryNameMap.set(c.id, c.name);
            // Also map the CODE part (if it has a colon) for fallback
            if (c.id.includes(':')) {
                const code = c.id.split(':')[1];
                if (!categoryNameMap.has(code)) {
                    categoryNameMap.set(code, c.name);
                }
            }
        });

        const realizedValues: Record<string, number> = {};
        entries.forEach((e: any) => {
            let catName = categoryNameMap.get(e.categoryId);
            
            if (!catName && e.categoryId.includes(':')) {
                catName = categoryNameMap.get(e.categoryId.split(':')[1]);
            }

            if (catName) {
                // FIXED: Aggressive normalization to handle " -Serviço" vs " - Serviço" vs "Serviço"
                const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const key = `${normalizedName}|${e.month - 1}`;
                realizedValues[key] = (realizedValues[key] || 0) + e.amount;
            }
        });

        return NextResponse.json({
            success: true,
            realizedValues,
            variantIdsUsed: allVariantIds
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
