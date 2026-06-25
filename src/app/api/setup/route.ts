import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        let [rawCategories, costCenters, tenants] = await Promise.all([
            prisma.category.findMany({ orderBy: { name: 'asc' } }),
            prisma.costCenter.findMany({ 
                include: { tenant: { select: { name: true, taxRate: true } } },
                orderBy: { name: 'asc' } 
            }),
            prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true, taxRate: true } })
        ]);

        // Garantir que as categorias gerenciais existam em todos os tenants ativos
        for (const tenant of tenants) {
            const parentId = `${tenant.id}:custos-transferidos-pai`;
            const saidasId = `${tenant.id}:custos-transferidos-saidas`;
            const entradasId = `${tenant.id}:custos-transferidos-entradas`;
            
            await prisma.category.upsert({
                where: { id: parentId },
                update: {},
                create: {
                    id: parentId,
                    name: '03.10 - Custos Transferidos',
                    tenantId: tenant.id,
                    type: 'EXPENSE',
                    entradaDre: 'DESPESAS_OPERACIONAIS'
                }
            });
            
            await prisma.category.upsert({
                where: { id: saidasId },
                update: {},
                create: {
                    id: saidasId,
                    name: '03.10.1 - Custos Transferidos saídas',
                    tenantId: tenant.id,
                    parentId: parentId,
                    type: 'EXPENSE',
                    entradaDre: 'DESPESAS_OPERACIONAIS'
                }
            });

            await prisma.category.upsert({
                where: { id: entradasId },
                update: {},
                create: {
                    id: entradasId,
                    name: '03.10.2 - Custos Transferidos entradas',
                    tenantId: tenant.id,
                    parentId: parentId,
                    type: 'EXPENSE',
                    entradaDre: 'DESPESAS_OPERACIONAIS'
                }
            });

            // NOVAS CATEGORIAS: 06.9 Dividas e 06.9.1 - Parcelamento Tributário competencia anteriores
            const parentDividasId = `${tenant.id}:dividas-pai`;
            const parcelamentoId = `${tenant.id}:dividas-parcelamento`;

            await prisma.category.upsert({
                where: { id: parentDividasId },
                update: {},
                create: {
                    id: parentDividasId,
                    name: '06.9 Dividas',
                    tenantId: tenant.id,
                    type: 'EXPENSE',
                    entradaDre: '06. DESPESAS FINANCEIRAS'
                }
            });

            await prisma.category.upsert({
                where: { id: parcelamentoId },
                update: {},
                create: {
                    id: parcelamentoId,
                    name: '06.9.1 - Parcelamento Tributário competencia anteriores',
                    tenantId: tenant.id,
                    parentId: parentDividasId,
                    type: 'EXPENSE',
                    entradaDre: '06. DESPESAS FINANCEIRAS'
                }
            });
        }
        // Recarrega as categorias após a inserção
        rawCategories = await prisma.category.findMany({ orderBy: { name: 'asc' } });

        const categories = rawCategories.filter((c: any) => !c.id.includes(',') && !c.id.includes('|'));

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
                        .replace(/^[\d. ]+-?\s*/, '') // Remove leading codes like "271.225 - " or "271.225 "
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
