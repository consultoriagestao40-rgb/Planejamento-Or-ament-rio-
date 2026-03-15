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

        const aggregatedValues: Record<string, number> = {};

        for (const entry of entries) {
            // Apply Cost Center filter if needed
            if (ccs.length > 0) {
                if (!entry.costCenterId || !ccs.includes(entry.costCenterId)) {
                    continue; 
                }
            }

            // RULE: Only 3-segment codes (X.Y.Z) are data points.
            const catName = categoryMap.get(entry.categoryId) || '';
            const codeMatch = catName.match(/^(\d{1,2}(?:\.\d+)*)/);
            const code = codeMatch ? codeMatch[1] : '';
            const codeSegments = code.split('.').filter(Boolean).length;
            
            if (codeSegments !== 3) continue;

            const key = `${entry.categoryId}-${entry.month - 1}`;
            aggregatedValues[key] = (aggregatedValues[key] || 0) + (entry.amount || 0);
        }

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

