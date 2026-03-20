import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { rows, tenantId, year, viewMode, overwrite, month } = await request.json();

        if (!rows || !Array.isArray(rows) || !tenantId || !year || !month) {
            return NextResponse.json({ success: false, error: "Dados incompletos (Empresa, Ano ou Mês ausentes)" }, { status: 400 });
        }

        // 1. Se overwrite for true, removemos os registros de TODA a família de empresas (variantes)
        // para garantir que não fiquem dados "fantasmas" de outras variantes no mesmo período.
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

        // 2. Prepara novos registros
        const entriesToSave = rows.map((row: any, idx: number) => ({
            tenantId: row.tenantId || tenantId,
            categoryId: row.categoryId,
            costCenterId: row.costCenterId || null,
            month: row.month || month,
            year,
            amount: parseFloat(row.amount) || 0,
            viewMode: viewMode || 'competencia',
            description: row.description || "Upload via Excel",
            // FIXED: Added idx and more randomness to guarantee uniqueness even for rateio rows from the same category/millisecond
            externalId: `manual-${row.tenantId || tenantId}-${row.categoryId}-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
        }));

        // 3. Inserção em massa
        if (entriesToSave.length > 0) {
            await prisma.realizedEntry.createMany({
                data: entriesToSave,
                skipDuplicates: true
            });
        }

        return NextResponse.json({ success: true, count: entriesToSave.length });

    } catch (error: any) {
        console.error("[EXCEL-BULK] Erro:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
