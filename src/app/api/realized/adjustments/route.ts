import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

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
            tenantId,             // Tenant original (origem)
            targetTenantId,       // Tenant destino (empresa selecionada)
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

        // Tenant de destino (se não enviado, assume o de origem)
        const finalTargetTenantId = targetTenantId || tenantId;

        // Datas correspondentes
        const estornoDate = date ? new Date(date) : new Date(yearNum, monthNum - 1, 1);
        const targetDate = targetMonth && targetYear ? new Date(targetYearNum, targetMonthNum - 1, estornoDate.getDate() || 1) : estornoDate;

        // Standardize IDs: Clean Tech / JVS Facility prefixed costCenterIds if required (apenas para a origem)
        let cleanCostCenterId = costCenterId || null;
        if (cleanCostCenterId && !cleanCostCenterId.includes(':') && cleanCostCenterId !== 'Geral') {
            cleanCostCenterId = `${tenantId}:${cleanCostCenterId}`;
        } else if (cleanCostCenterId === 'Geral') {
            cleanCostCenterId = null;
        }

        // Se cruzarmos empresas, o Centro de Custo da empresa original não pode ir para a empresa de destino
        // para evitar violação de Foreign Key. Nesse caso, a transação na empresa destino cai no "Geral" (null)
        let targetCostCenterId = cleanCostCenterId;
        if (finalTargetTenantId !== tenantId) {
            targetCostCenterId = null;
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
        const cleanTargetCategoryId = await getCleanCategoryId(targetCategoryId, finalTargetTenantId);

        // Geramos um UUID para garantir a unicidade do par de reclassificação (permitindo reclassificações parciais múltiplas)
        const adjustUuid = crypto.randomUUID();
        // 1. Estorno (Negative value in source category and source company)
        const estornoExternalId = `adj-neg-${sourceTransactionId || 'manual'}-${adjustUuid}`;
        const finalEstornoId = sourceTransactionId ? `adj-neg-${sourceTransactionId}-${adjustUuid}` : estornoExternalId;

        // 2. Reclassificação (Positive value in target category and target company)
        const reclassExternalId = `adj-pos-${sourceTransactionId || 'manual'}-${adjustUuid}`;
        const finalReclassId = sourceTransactionId ? `adj-pos-${sourceTransactionId}-${adjustUuid}` : reclassExternalId;

        // Run in transaction to guarantee consistency
        const result = await prisma.$transaction(async (tx) => {
            // Estorno na empresa de origem
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

            // Target Entry (Positive adjustment) na empresa de destino
            const posEntry = await tx.realizedEntry.upsert({
                where: {
                    externalId_viewMode_tenantId: {
                        externalId: finalReclassId,
                        viewMode,
                        tenantId: finalTargetTenantId
                    }
                },
                update: {
                    amount: Math.abs(numericAmount),
                    categoryId: cleanTargetCategoryId,
                    costCenterId: targetCostCenterId,
                    month: targetMonthNum,
                    year: targetYearNum,
                    date: targetDate,
                    description: `[Reclassificação Gerencial] ${description || ''}`.trim()
                },
                create: {
                    externalId: finalReclassId,
                    viewMode,
                    tenantId: finalTargetTenantId,
                    amount: Math.abs(numericAmount),
                    categoryId: cleanTargetCategoryId,
                    costCenterId: targetCostCenterId,
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
        const externalId = searchParams.get('externalId');
        const viewMode = searchParams.get('viewMode') || 'competencia';
        const tenantId = searchParams.get('tenantId');

        if (!sourceTransactionId || !tenantId) {
            return NextResponse.json({ success: false, error: 'Missing sourceTransactionId or tenantId' }, { status: 400 });
        }

        let targetExternalIds: string[] = [];

        // Se passarmos o externalId específico, extraímos o UUID para apagar o par (estorno e ajuste positivo) correspondente
        if (externalId) {
            let adjustUuid = '';
            if (externalId.includes('-')) {
                const parts = externalId.split('-');
                adjustUuid = parts[parts.length - 1];
            }
            if (adjustUuid) {
                targetExternalIds = [
                    `adj-neg-${sourceTransactionId}-${adjustUuid}`,
                    `adj-pos-${sourceTransactionId}-${adjustUuid}`
                ];
            }
        }

        // Caso não seja um ajuste parcial novo (compatibilidade retroativa), apagamos o ID fixo legado
        if (targetExternalIds.length === 0) {
            targetExternalIds = [
                `adj-neg-${sourceTransactionId}-${viewMode}`,
                `adj-pos-${sourceTransactionId}-${viewMode}`
            ];
        }

        // Deletamos as transações gerenciais correspondentes de forma atômica
        const deleted = await prisma.realizedEntry.deleteMany({
            where: {
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
