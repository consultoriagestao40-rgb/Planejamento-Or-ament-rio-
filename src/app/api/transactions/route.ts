import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get('categoryId');
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '2026', 10);
        const viewMode = (searchParams.get('viewMode') || 'competencia') as 'caixa' | 'competencia';
        const tenantIdParam = searchParams.get('tenantId') || 'ALL';

        if (!categoryId) {
            return NextResponse.json({ success: false, error: 'Category ID is required' }, { status: 400 });
        }

        // 1. Determine Target Tenants (Primary IDs) using unified tenant-utils
        const { getAllVariantIds } = await import('@/lib/tenant-utils');
        let targetTenantIds: string[] = [];
        
        if (tenantIdParam === 'ALL' || tenantIdParam === 'DEFAULT') {
            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            targetTenantIds = allTenants.map(t => t.id);
        } else {
            const requestedIds = tenantIdParam.split(',').map(id => id.trim()).filter(Boolean);
            const variantSets = await Promise.all(requestedIds.map(id => getAllVariantIds(id)));
            targetTenantIds = Array.from(new Set(variantSets.flat()));
        }

        // 2. Determine Category IDs (Strict matching to Grid row)
        const allCategoryIds = new Set<string>();

        if (categoryId.startsWith('synth-')) {
            const codePrefix = categoryId.replace('synth-', '');
            // For synthetic parents, we DO need to find all children that match the code
            const children = await prisma.category.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    name: { startsWith: codePrefix }
                },
                select: { id: true }
            });
            children.forEach(c => allCategoryIds.add(c.id));
        } else {
            // For leaf/merged categories from the Grid, we use the IDs EXACTLY as provided
            // This prevents "hidden" children from appearing in the modal if they are not seen in the grid row.
            categoryId.split(',').map(id => id.trim()).filter(Boolean).forEach(id => allCategoryIds.add(id));
        }

        // 3. Query DB for transactions (using realizedEntry)
        // Note: realizedEntry currently aggregates by month.
        // If we want raw transactions, we would need a Transaction table.
        // For now, we return the aggregated monthly entry as a single "transaction" per category/CC
        // to at least popluate the modal.
        
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: { in: targetTenantIds },
                categoryId: { in: Array.from(allCategoryIds) },
                month: month + 1, // 0-indexed from UI to 1-indexed in DB
                year,
                viewMode
            },
            include: {
                category: true,
                tenant: true,
                costCenter: true
            }
        });

        const transactions = entries.map(e => ({
            id: e.id,
            date: e.date || `${year}-${String(month + 1).padStart(2, '0')}-01`,
            description: e.description || `Lançamento: ${e.category.name}`,
            value: e.amount,
            customer: e.customer || e.tenant.name,
            status: 'REALIZADO',
            tenantName: e.tenant.name,
            costCenters: e.costCenter ? [{ nome: e.costCenter.name }] : []
        }));

        return NextResponse.json({
            success: true,
            transactions: transactions.sort((a, b) => b.value - a.value)
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
