import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getCleanCategoryId(rawId: string, currentTenantId: string): Promise<string> {
    const categoryUuid = rawId.includes(':') ? rawId.split(':')[1] : rawId;
    const prefixedId = `${currentTenantId}:${categoryUuid}`;
    const existsPrefixed = await prisma.category.findUnique({ where: { id: prefixedId } });
    if (existsPrefixed) return prefixedId;
    const existsGlobal = await prisma.category.findUnique({ where: { id: categoryUuid } });
    if (existsGlobal) return categoryUuid;
    const existsRaw = await prisma.category.findUnique({ where: { id: rawId } });
    if (existsRaw) return rawId;
    return rawId;
}

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
        const sourceCategoryId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b'; // Juros
        const targetCategoryId = 'ff1133d9-438c-418f-9fbd-7aaea606c089'; // Serviços Vendidos global
        
        // 1. Verificar categorias no banco
        const srcCatInDb = await prisma.category.findUnique({ where: { id: sourceCategoryId } });
        const tgtCatInDbWithPrefix = await prisma.category.findUnique({ where: { id: `${tenantId}:${targetCategoryId}` } });
        const tgtCatInDbGlobal = await prisma.category.findUnique({ where: { id: targetCategoryId } });
        
        // 2. Resolver os clean IDs
        const cleanSrcId = await getCleanCategoryId(sourceCategoryId, tenantId);
        const cleanTgtId = await getCleanCategoryId(targetCategoryId, tenantId);
        
        // 3. Simular a transação de upsert no banco
        let transactionResult = 'NOT_RUN';
        let transactionError = null;
        try {
            await prisma.$transaction(async (tx) => {
                const finalEstornoId = 'diag-test-neg';
                const finalReclassId = 'diag-test-pos';
                
                await tx.realizedEntry.upsert({
                    where: {
                        externalId_viewMode_tenantId: {
                            externalId: finalEstornoId,
                            viewMode: 'competencia',
                            tenantId
                        }
                    },
                    update: {
                        amount: -55432.03,
                        categoryId: cleanSrcId,
                        month: 12,
                        year: 2025,
                        date: new Date(2025, 11, 1),
                        description: 'DIAG TEST ESTORNO'
                    },
                    create: {
                        externalId: finalEstornoId,
                        viewMode: 'competencia',
                        tenantId,
                        amount: -55432.03,
                        categoryId: cleanSrcId,
                        month: 12,
                        year: 2025,
                        date: new Date(2025, 11, 1),
                        description: 'DIAG TEST ESTORNO'
                    }
                });
                
                await tx.realizedEntry.upsert({
                    where: {
                        externalId_viewMode_tenantId: {
                            externalId: finalReclassId,
                            viewMode: 'competencia',
                            tenantId
                        }
                    },
                    update: {
                        amount: 55432.03,
                        categoryId: cleanTgtId,
                        month: 12,
                        year: 2025,
                        date: new Date(2025, 11, 1),
                        description: 'DIAG TEST RECLASS'
                    },
                    create: {
                        externalId: finalReclassId,
                        viewMode: 'competencia',
                        tenantId,
                        amount: 55432.03,
                        categoryId: cleanTgtId,
                        month: 12,
                        year: 2025,
                        date: new Date(2025, 11, 1),
                        description: 'DIAG TEST RECLASS'
                    }
                });
                
                throw new Error("ROLLBACK_ON_SUCCESS");
            });
        } catch (err: any) {
            if (err.message === 'ROLLBACK_ON_SUCCESS') {
                transactionResult = 'SUCCESS_SIMULATED';
            } else {
                transactionResult = 'FAILED';
                transactionError = {
                    message: err.message,
                    code: err.code,
                    meta: err.meta
                };
            }
        }
        
        return NextResponse.json({
            success: true,
            categoriesInDb: {
                sourceCategoryId: sourceCategoryId,
                sourceCategoryExists: !!srcCatInDb,
                sourceCategoryDetails: srcCatInDb,
                targetCategoryWithPrefix: `${tenantId}:${targetCategoryId}`,
                targetCategoryWithPrefixExists: !!tgtCatInDbWithPrefix,
                targetCategoryWithPrefixDetails: tgtCatInDbWithPrefix,
                targetCategoryGlobal: targetCategoryId,
                targetCategoryGlobalExists: !!tgtCatInDbGlobal,
                targetCategoryGlobalDetails: tgtCatInDbGlobal
            },
            resolvedIds: {
                cleanSrcId,
                cleanTgtId
            },
            transactionResult,
            transactionError
        });
        
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
