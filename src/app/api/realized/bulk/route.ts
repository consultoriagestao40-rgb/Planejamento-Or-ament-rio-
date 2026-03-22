import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { rows, tenantId, year, viewMode, overwrite, month } = await request.json();

        if (!rows || !Array.isArray(rows) || !tenantId || !year || !month) {
            return NextResponse.json({ success: false, error: "Dados incompletos (Empresa, Ano ou Mês ausentes)" }, { status: 400 });
        }

        // 1. Se overwrite for true, remove todos os dados do período para o grupo de empresas
        if (overwrite) {
            const { getAllVariantIds } = await import('@/lib/tenant-utils');
            const allVariantIds = await getAllVariantIds(tenantId);
            
            console.log(`[EXCEL-BULK] Sobrescrevendo dados para Tenant Group: [${allVariantIds.join(',')}] Month: ${month}, Year: ${year}`);
            
            await prisma.realizedEntry.deleteMany({
                where: {
                    tenantId: { in: allVariantIds },
                    month: parseInt(month),
                    year: parseInt(year)
                }
            });
        }

        // 2. Agregar linhas por chave única (tenantId, categoryId, costCenterId, month, year, viewMode)
        // Isso respeita a constraint única do banco e preserva 100% do valor total
        const aggregated = new Map<string, {
            tenantId: string;
            categoryId: string;
            costCenterId: string | null;
            month: number;
            year: number;
            viewMode: string;
            amount: number;
            description: string;
        }>();

        const effectiveViewMode = viewMode || 'competencia';
        const effectiveMonth = parseInt(month);
        const effectiveYear = parseInt(year);

        for (const row of rows) {
            const rowTenantId = row.tenantId || tenantId;
            const rowCategoryId = row.categoryId;
            const rowCostCenterId = row.costCenterId || null;
            const rowMonth = row.month || effectiveMonth;
            const rowAmount = parseFloat(row.amount) || 0;
            const rowDesc = row.description || "Upload via Excel";

            const key = `${rowTenantId}||${rowCategoryId}||${rowCostCenterId}||${rowMonth}||${effectiveYear}||${effectiveViewMode}`;
            
            if (aggregated.has(key)) {
                const existing = aggregated.get(key)!;
                existing.amount += rowAmount;
                // Keep first description unless new one is more informative
                if (rowDesc.length > existing.description.length) {
                    existing.description = rowDesc;
                }
            } else {
                aggregated.set(key, {
                    tenantId: rowTenantId,
                    categoryId: rowCategoryId,
                    costCenterId: rowCostCenterId,
                    month: typeof rowMonth === 'number' ? rowMonth : parseInt(rowMonth),
                    year: effectiveYear,
                    viewMode: effectiveViewMode,
                    amount: rowAmount,
                    description: rowDesc,
                });
            }
        }

        const entriesToSave = Array.from(aggregated.values()).map(entry => ({
            ...entry,
            externalId: crypto.randomUUID()
        }));

        console.log(`[EXCEL-BULK] ${rows.length} linhas -> ${entriesToSave.length} entradas únicas agregadas`);

        // 3. Inserção em massa com valores agregados
        let createdCount = 0;
        if (entriesToSave.length > 0) {
            const result = await prisma.realizedEntry.createMany({
                data: entriesToSave,
            });
            createdCount = result.count;
        }

        return NextResponse.json({ success: true, count: createdCount, rawRows: rows.length, aggregatedRows: entriesToSave.length });

    } catch (error: any) {
        console.error("[EXCEL-BULK] Erro:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
