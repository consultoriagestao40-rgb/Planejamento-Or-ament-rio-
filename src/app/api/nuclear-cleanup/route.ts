import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log("--- INICIANDO LIMPEZA NUCLEAR SPOT (2026) ---");
        
        const spotTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } },
            select: { id: true, name: true }
        });
        
        const ids = spotTenants.map(t => t.id);
        if (ids.length === 0) return NextResponse.json({ success: false, message: 'Nenhum tenant da SPOT encontrado para limpeza.' });

        // EXHAUSTIVE DELETE: Catch all possible orphans by joining with common variants if needed
        const deletedEntries = await prisma.realizedEntry.deleteMany({
            where: { 
                tenantId: { in: ids },
                year: 2026
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: `Limpeza exaustiva finalizada. Removidos ${deletedEntries.count} lançamentos de 2026 da SPOT FACILITIES.`,
            clearedTenants: spotTenants.map(t => t.name)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
