import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { rows, tenantId, year, viewMode } = await request.json();

        if (!rows || !Array.isArray(rows) || !tenantId || !year) {
            return NextResponse.json({ success: false, error: "Dados inválidos" }, { status: 400 });
        }

        const entriesToSave = rows.map((row: any) => ({
            tenantId,
            categoryId: row.categoryId,
            costCenterId: row.costCenterId || null,
            month: row.month,
            year,
            amount: Math.abs(parseFloat(row.amount) || 0),
            viewMode: viewMode || 'competencia',
            externalId: `excel-${tenantId}-${row.categoryId}-${row.costCenterId || 'NONE'}-${year}-${row.month}-${viewMode || 'competencia'}-${Date.now()}`,
            description: "Upload via Excel"
        }));

        // Limpa dados anteriores do mesmo tipo para evitar duplicidade? 
        // Melhor não apagar tudo, apenas inserir os novos (ou apagar se o usuário quiser substituir tudo).
        // Por simplificação desta ferramenta de emergência, vamos apenas adicionar.

        if (entriesToSave.length > 0) {
            await prisma.realizedEntry.createMany({
                data: entriesToSave,
                skipDuplicates: true
            });
        }

        return NextResponse.json({ success: true, count: entriesToSave.length });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
