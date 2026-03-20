import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { rows, tenantId, year, viewMode, overwrite, month } = await request.json();

        if (!rows || !Array.isArray(rows) || !tenantId || !year || !month) {
            return NextResponse.json({ success: false, error: "Dados incompletos (Empresa, Ano ou Mês ausentes)" }, { status: 400 });
        }

        // 1. Se overwrite for true, removemos os registros manuais (ou todos) desse período
        if (overwrite) {
            console.log(`[EXCEL-BULK] Sobrescrevendo dados para Tenant: ${tenantId}, Mês: ${month}, Ano: ${year}`);
            await prisma.realizedEntry.deleteMany({
                where: {
                    tenantId,
                    month: parseInt(month),
                    year: parseInt(year)
                    // REMOVIDO: externalId: { startsWith: 'manual-' } -> Agora deleta TUDO (incluindo sync)
                    // REMOVIDO: viewMode filter
                }
            });
        }

        // 2. Prepara novos registros
        const entriesToSave = rows.map((row: any) => ({
            tenantId,
            categoryId: row.categoryId,
            costCenterId: row.costCenterId || null,
            month: row.month || month,
            year,
            amount: Math.abs(parseFloat(row.amount) || 0),
            viewMode: viewMode || 'competencia',
            description: row.description || "Upload via Excel",
            externalId: `manual-${tenantId}-${row.categoryId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
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
