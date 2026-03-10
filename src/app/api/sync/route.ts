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
        const tenantIds = tenantIdParam !== 'ALL' ? tenantIdParam.split(',').map(t => t.trim()).filter(Boolean) : [];

        // Determine unique tenants to include to avoid double-counting duplicate records
        const allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
        const seenKeys = new Set();
        const validTenantIds = new Set<string>();
        for (const t of allTenants) {
            const superCleanName = (t.name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const key = cleanCnpj || superCleanName;
            
            if (!seenKeys.has(key)) {
                validTenantIds.add(t.id);
                seenKeys.add(key);
            }
        }

        const ccs = costCenterId.split(',').filter(id => id !== 'DEFAULT');

        // Query Cache
        const entries = await prisma.realizedEntry.findMany({
            where: {
                ...(tenantIdParam !== 'ALL' && tenantIds.length > 0 
                  ? { tenantId: { in: tenantIds.filter(id => validTenantIds.has(id)) } } 
                  : { tenantId: { in: Array.from(validTenantIds) } }),
                year,
                viewMode
            }
        });

        const aggregatedValues: Record<string, number> = {};

        for (const entry of entries) {
            // Apply Cost Center filter if needed
            if (ccs.length > 0) {
                if (!entry.costCenterId || !ccs.includes(entry.costCenterId)) {
                    continue; // Skip if it belongs to an unselected cost center
                }
            }

            const key = `${entry.categoryId}-${entry.month}`;
            aggregatedValues[key] = (aggregatedValues[key] || 0) + entry.amount;
        }

        return NextResponse.json({
            success: true,
            realizedValues: aggregatedValues,
            data: { success: true, timestamp: new Date().toISOString() } // Dummy data to satisfy frontend
        });

    } catch (error: any) {
        console.error('Critical Sync route failure:', error);
        return NextResponse.json({ success: false, error: error.message || 'Fatal error during DB read' }, { status: 500 });
    }
}

