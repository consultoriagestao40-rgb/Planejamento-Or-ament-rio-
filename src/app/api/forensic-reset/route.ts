import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Investigação Forense: Buscar TODOS os orçamentos de 2026
        const allEntries = await prisma.budgetEntry.findMany({
            where: { year: 2026 },
            include: { 
                category: { select: { name: true } }, 
                costCenter: { select: { name: true, id: true } }, 
                tenant: { select: { name: true } } 
            }
        });

        // Detonar TUDO o que for de 2026 para recomeçarmos do zero absoluto
        const deleted = await prisma.budgetEntry.deleteMany({
            where: { year: 2026 }
        });

        return NextResponse.json({ 
            success: true, 
            message: `VARREDURA GLOBAL CONCLUÍDA! ${deleted.count} registros intrusos foram aniquilados do sistema inteiro.`,
            investigationReport: allEntries.map(e => ({
                valor: e.amount,
                mes: e.month,
                categoria: e.category.name,
                empresa: e.tenant?.name || 'Sem Empresa',
                centroCusto: e.costCenter?.name || 'Geral',
                ccId: e.costCenterId
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
