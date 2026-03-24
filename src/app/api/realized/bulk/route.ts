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

        // 2. Prepare entries to save (Individually, no aggregation)
        const entriesToSave = rows.map((row: any) => {
            const rowTenantId = row.tenantId || tenantId;
            const rowCategoryId = row.categoryId;
            const rowCostCenterId = row.costCenterId || null;
            const rowMonth = row.month || parseInt(month);
            const rowYear = row.year || parseInt(year);
            const rowAmount = parseFloat(row.amount) || 0;
            const rowDesc = row.description || "Upload via Excel";
            const rowCustomer = row.customer || null;
            const rowDateRaw = row.date || null;
            
            let rowDate = null;
            if (rowDateRaw) {
                const parsedDate = new Date(rowDateRaw);
                if (!isNaN(parsedDate.getTime())) {
                    rowDate = parsedDate;
                }
            }

            return {
                tenantId: rowTenantId,
                categoryId: rowCategoryId,
                costCenterId: rowCostCenterId,
                month: typeof rowMonth === 'number' ? rowMonth : parseInt(rowMonth),
                year: typeof rowYear === 'number' ? rowYear : parseInt(rowYear),
                viewMode: viewMode || 'competencia',
                amount: rowAmount,
                description: rowDesc,
                customer: rowCustomer,
                date: rowDate,
                externalId: crypto.randomUUID()
            };
        });

        console.log(`[EXCEL-BULK] processando ${rows.length} linhas individuais.`);

        // 3. Inserção em massa
        let createdCount = 0;
        if (entriesToSave.length > 0) {
            const result = await prisma.realizedEntry.createMany({
                data: entriesToSave,
            });
            createdCount = result.count;
        }

        return NextResponse.json({ success: true, count: createdCount, rawRows: rows.length });

    } catch (error: any) {
        console.error("[EXCEL-BULK] Erro:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
