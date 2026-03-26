import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [categories, costCenters, tenants] = await Promise.all([
            prisma.category.findMany({ orderBy: { name: 'asc' } }),
            prisma.costCenter.findMany({ 
                include: { tenant: { select: { name: true, taxRate: true } } },
                orderBy: { name: 'asc' } 
            }),
            prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true, taxRate: true } })
        ]);

        console.log(`[RECOVERY] Loaded ${categories.length} categories and ${costCenters.length} cost centers`);

        return NextResponse.json({
            success: true,
            categories: categories.map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                parentId: cat.parentId,
                type: cat.type,
                tenantId: cat.tenantId,
                entradaDre: (cat as any).entradaDre || null
            })),
            costCenters: (() => {
                const normalizeName = (name: string) => 
                    (name || '')
                        .toLowerCase()
                        .replace(/^\[inativo\]\s*/i, '')
                        .replace(/^encerrado\s*/i, '')
                        .replace(/[^a-z0-9]/g, '')
                        .trim();

                const blacklist = ['CLEAN TECH', 'RIO NEGRINHO', 'REDE TONIN'];
                const map = new Map<string, any>();
                
                costCenters.forEach((cc: any) => {
                    const originalName = (cc.name || '').toUpperCase();
                    const nName = normalizeName(cc.name);
                    const key = `${cc.tenantId}-${nName}`;
                    
                    // If it's CLEAN TECH PRO, it's explicitly Whitelisted as per user request
                    const isWhiteListed = originalName.includes('CLEAN TECH PRO');
                    
                    const isBlacklisted = !isWhiteListed && (
                        blacklist.some(b => originalName.includes(b)) || 
                        originalName.includes('[INATIVO]') || 
                        originalName.includes('ENCERRADO')
                    );

                    if (isBlacklisted) {
                        // Skip these if we want them totally hidden
                        return;
                    }

                    if (!map.has(key)) {
                        const displayName = (cc.name || '')
                            .replace(/^\[INATIVO\]\s*/i, '')
                            .replace(/^ENCERRADO\s*/i, '')
                            .trim();

                        map.set(key, {
                            id: cc.id,
                            name: displayName,
                            tenantId: cc.tenantId,
                            tenantName: cc.tenant?.name || 'Empresa Desconhecida',
                            taxRate: cc.tenant?.taxRate || 0
                        });
                    }
                });
                return Array.from(map.values());
            })(),
            tenants: tenants.map((t: any) => ({
                id: t.id,
                name: t.name,
                cnpj: t.cnpj || '',
                taxRate: t.taxRate || 0
            })),
            // Added fullCostCenters for direct ID lookup (BudgetEntryPage needs the exact ID)
            fullCostCenters: costCenters.map((cc: any) => ({
                id: cc.id,
                name: cc.name,
                tenantId: cc.tenantId,
                tenantName: cc.tenant?.name || 'Empresa Desconhecida',
                taxRate: cc.tenant?.taxRate || 0
            }))
        });
    } catch (error: any) {
        console.error('CRITICAL API ERROR during recovery:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
