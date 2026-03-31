import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * v69.4 - Script de Reparo: Migração de Orçamentos de IDs Inativos para Ativos
 * Este script busca orçamentos que ficaram "órfãos" em IDs [INATIVO] 
 * e os move para o ID do CC correspondente (mesmo nome normalizado).
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dryRun = searchParams.get('dryRun') !== 'false'; // Default to dryRun for safety

        // 1. Pegar todos os CCs
        const allCCs = await prisma.costCenter.findMany();
        
        const normalize = (name: string) => (name || '')
            .toLowerCase()
            .replace(/^\[inativo\]\s*/i, '')
            .replace(/^encerrado\s*/i, '')
            .replace(/^[\d. ]+-?\s*/, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();

        const activeCCs = allCCs.filter(cc => !cc.name.toUpperCase().includes('[INATIVO]') && !cc.name.toUpperCase().includes('ENCERRADO'));
        const inactiveCCs = allCCs.filter(cc => cc.name.toUpperCase().includes('[INATIVO]') || cc.name.toUpperCase().includes('ENCERRADO'));

        const results: any[] = [];
        let totalBudgetsMixed = 0;
        let totalRealizedMixed = 0;

        for (const inactive of inactiveCCs) {
            const iNorm = normalize(inactive.name);
            if (!iNorm) continue;

            const targetActive = activeCCs.find(a => normalize(a.name) === iNorm && a.tenantId === inactive.tenantId);

            if (targetActive) {
                // Encontrou o par Ativo
                const budgets = await prisma.budgetEntry.findMany({ where: { costCenterId: inactive.id } });
                const realized = await prisma.realizedEntry.findMany({ where: { costCenterId: inactive.id } });

                if (budgets.length > 0 || realized.length > 0) {
                    results.push({
                        from: inactive.name,
                        fromId: inactive.id,
                        to: targetActive.name,
                        toId: targetActive.id,
                        budgetsCount: budgets.length,
                        realizedCount: realized.length
                    });

                    if (!dryRun) {
                        // Migração real
                        if (budgets.length > 0) {
                            await prisma.budgetEntry.updateMany({
                                where: { costCenterId: inactive.id },
                                data: { costCenterId: targetActive.id }
                            });
                            totalBudgetsMixed += budgets.length;
                        }
                        if (realized.length > 0) {
                            await prisma.realizedEntry.updateMany({
                                where: { costCenterId: inactive.id },
                                data: { costCenterId: targetActive.id }
                            });
                            totalRealizedMixed += realized.length;
                        }
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            dryRun,
            migrated: results,
            summary: {
                budgets: dryRun ? 0 : totalBudgetsMixed,
                realized: dryRun ? 0 : totalRealizedMixed,
                totalPairsFound: results.length
            },
            message: dryRun ? "SIMULAÇÃO: Use ?dryRun=false para executar a migração real." : "MIGRAÇÃO CONCLUÍDA: Dados movidos para os novos IDs ativos."
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
