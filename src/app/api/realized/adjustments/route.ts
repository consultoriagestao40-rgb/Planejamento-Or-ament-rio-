import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getCleanCategoryId(rawId: string, currentTenantId: string): Promise<string> {
    const categoryUuid = rawId.includes(':') ? rawId.split(':')[1] : rawId;
    
    // 1. Testa se existe a versão com prefixo do tenant atual
    const prefixedId = `${currentTenantId}:${categoryUuid}`;
    const existsPrefixed = await prisma.category.findUnique({
        where: { id: prefixedId }
    });
    if (existsPrefixed) {
        return prefixedId;
    }
    
    // 2. Senão, testa se existe a versão global (uuid puro)
    const existsGlobal = await prisma.category.findUnique({
        where: { id: categoryUuid }
    });
    if (existsGlobal) {
        return categoryUuid;
    }
    
    // 3. Senão, testa se o ID bruto fornecido existe
    const existsRaw = await prisma.category.findUnique({
        where: { id: rawId }
    });
    if (existsRaw) {
        return rawId;
    }
    
    return rawId;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            sourceTransactionId,
            tenantId,
            sourceCategoryId,
            targetCategoryId,
            costCenterId,
            month,
            year,
            targetMonth,
            targetYear,
            amount,
            description,
            date,
            viewMode = 'competencia'
        } = body;

        if (!tenantId || !sourceCategoryId || !targetCategoryId || !month || !year || amount === undefined) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        const numericAmount = parseFloat(String(amount));
        const monthNum = parseInt(String(month), 10);
        const yearNum = parseInt(String(year), 10);

        // Competência destino (se não enviada, assume a de origem)
        const targetMonthNum = targetMonth ? parseInt(String(targetMonth), 10) : monthNum;
        const targetYearNum = targetYear ? parseInt(String(targetYear), 10) : yearNum;

        // Datas correspondentes
        const estornoDate = date ? new Date(date) : new Date(yearNum, monthNum - 1, 1);
        const targetDate = targetMonth && targetYear ? new Date(targetYearNum, targetMonthNum - 1, estornoDate.getDate() || 1) : estornoDate;

        // Standardize IDs: Clean Tech / JVS Facility prefixed costCenterIds if required
        let cleanCostCenterId = costCenterId || null;
        if (cleanCostCenterId && !cleanCostCenterId.includes(':') && cleanCostCenterId !== 'Geral') {
            cleanCostCenterId = `${tenantId}:${cleanCostCenterId}`;
        } else if (cleanCostCenterId === 'Geral') {
            cleanCostCenterId = null;
        }

        // Resolve sourceCategoryId if it's synthetic (e.g. starts with 'synth-'), comma-separated (merged cells), or falsy
        let finalSourceCategoryId = sourceCategoryId;
        if (sourceTransactionId && (!sourceCategoryId || sourceCategoryId.startsWith('synth-') || sourceCategoryId.includes(','))) {
            const sourceTx = await prisma.realizedEntry.findUnique({
                where: { id: sourceTransactionId }
            });
            if (sourceTx) {
                finalSourceCategoryId = sourceTx.categoryId;
            }
        }

        // Clean sourceCategory and targetCategory using robust async resolver
        const cleanSourceCategoryId = await getCleanCategoryId(finalSourceCategoryId, tenantId);
        const cleanTargetCategoryId = await getCleanCategoryId(targetCategoryId, tenantId);

        // 1. Estorno (Negative value in source category)
        const estornoExternalId = `adj-neg-${sourceTransactionId || 'manual'}-${Date.now()}-${viewMode}`;
        const finalEstornoId = sourceTransactionId ? `adj-neg-${sourceTransactionId}-${viewMode}` : estornoExternalId;

        // 2. Reclassificação (Positive value in target category)
        const reclassExternalId = `adj-pos-${sourceTransactionId || 'manual'}-${Date.now()}-${viewMode}`;
        const finalReclassId = sourceTransactionId ? `adj-pos-${sourceTransactionId}-${viewMode}` : reclassExternalId;

        // Run in transaction to guarantee consistency
        const result = await prisma.$transaction(async (tx) => {
            // Estorno
            const negEntry = await tx.realizedEntry.upsert({
                where: {
                    externalId_viewMode_tenantId: {
                        externalId: finalEstornoId,
                        viewMode,
                        tenantId
                    }
                },
                update: {
                    amount: -Math.abs(numericAmount),
                    categoryId: cleanSourceCategoryId,
                    costCenterId: cleanCostCenterId,
                    month: monthNum,
                    year: yearNum,
                    date: estornoDate,
                    description: `[Estorno Gerencial] ${description || ''}`.trim()
                },
                create: {
                    externalId: finalEstornoId,
                    viewMode,
                    tenantId,
                    amount: -Math.abs(numericAmount),
                    categoryId: cleanSourceCategoryId,
                    costCenterId: cleanCostCenterId,
                    month: monthNum,
                    year: yearNum,
                    date: estornoDate,
                    description: `[Estorno Gerencial] ${description || ''}`.trim()
                }
            });

            // Target Entry (Positive adjustment)
            const posEntry = await tx.realizedEntry.upsert({
                where: {
                    externalId_viewMode_tenantId: {
                        externalId: finalReclassId,
                        viewMode,
                        tenantId
                    }
                },
                update: {
                    amount: Math.abs(numericAmount),
                    categoryId: cleanTargetCategoryId,
                    costCenterId: cleanCostCenterId,
                    month: targetMonthNum,
                    year: targetYearNum,
                    date: targetDate,
                    description: `[Reclassificação Gerencial] ${description || ''}`.trim()
                },
                create: {
                    externalId: finalReclassId,
                    viewMode,
                    tenantId,
                    amount: Math.abs(numericAmount),
                    categoryId: cleanTargetCategoryId,
                    costCenterId: cleanCostCenterId,
                    month: targetMonthNum,
                    year: targetYearNum,
                    date: targetDate,
                    description: `[Reclassificação Gerencial] ${description || ''}`.trim()
                }
            });

            return { negEntry, posEntry };
        });

        return NextResponse.json({ success: true, data: result });

    } catch (error: any) {
        console.error('Error creating managerial adjustment:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sourceTransactionId = searchParams.get('sourceTransactionId');
        const viewMode = searchParams.get('viewMode') || 'competencia';
        const tenantId = searchParams.get('tenantId');

        if (!sourceTransactionId || !tenantId) {
            return NextResponse.json({ success: false, error: 'Missing sourceTransactionId or tenantId' }, { status: 400 });
        }

        const targetExternalIds = [
            `adj-neg-${sourceTransactionId}-${viewMode}`,
            `adj-pos-${sourceTransactionId}-${viewMode}`
        ];

        const deleted = await prisma.realizedEntry.deleteMany({
            where: {
                tenantId,
                viewMode,
                externalId: { in: targetExternalIds }
            }
        });

        return NextResponse.json({ success: true, count: deleted.count });

    } catch (error: any) {
        console.error('Error deleting managerial adjustment:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
