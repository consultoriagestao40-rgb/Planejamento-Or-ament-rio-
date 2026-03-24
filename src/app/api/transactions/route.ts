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

        // 1. Determine Target Tenants (Primary IDs)
        const allTenants = await prisma.tenant.findMany();
        const companyGroups = new Map<string, string[]>();
        allTenants.forEach((t: any) => {
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
            if (!companyGroups.has(key)) companyGroups.set(key, []);
            companyGroups.get(key)!.push(t.id);
        });

        let targetTenantIds: string[] = [];
        if (tenantIdParam === 'ALL') {
             targetTenantIds = Array.from(companyGroups.values()).map(ids => ids.sort()[0]);
        } else {
            const inputIds = tenantIdParam.split(',').map(t => t.trim()).filter(Boolean);
            for (const id of inputIds) {
                const t = allTenants.find((ten: any) => ten.id === id);
                if (t) {
                    const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
                    const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
                    const group = companyGroups.get(key) || [id];
                    const primary = group.sort()[0];
                    if (!targetTenantIds.includes(primary)) targetTenantIds.push(primary);
                }
            }
        }

        // 2. Expand Category IDs (Children)
        const allCategoryIds = new Set<string>();

        if (categoryId.startsWith('synth-')) {
            const codePrefix = categoryId.replace('synth-', '');
            // Find all categories that start with this code in their name (e.g. '01.1')
            const children = await prisma.category.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    name: { startsWith: codePrefix }
                },
                select: { id: true }
            });
            children.forEach(c => allCategoryIds.add(c.id));
        } else {
            const initialIds = categoryId.split(',');
            const queue = [...initialIds];
            while (queue.length > 0) {
                const current = queue.shift()!;
                if (allCategoryIds.has(current)) continue;
                allCategoryIds.add(current);
                const children = await prisma.category.findMany({ where: { parentId: current }, select: { id: true } });
                queue.push(...children.map(c => c.id));
            }
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
