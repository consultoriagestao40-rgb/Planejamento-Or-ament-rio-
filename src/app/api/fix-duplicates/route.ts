import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const allTenants = await prisma.tenant.findMany({
            orderBy: { updatedAt: 'desc' }
        });

        const seenKeys = new Set();
        const toDeleteIds: string[] = [];
        const mapping: Record<string, string> = {}; // duplicateId -> masterId

        for (const t of allTenants) {
            // Normalização agressiva: apenas letras e números do nome ou o CNPJ
            const superCleanName = (t.name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const key = cleanCnpj || superCleanName;

            if (seenKeys.has(key)) {
                toDeleteIds.push(t.id);
            } else {
                seenKeys.add(key);
                // O primeiro (mais recente devido ao orderBy) vira o Master
            }
        }

        if (toDeleteIds.length > 0) {
            // Removemos as entradas realizadas e orçadas desses IDs duplicados para limpar o Grid
            await prisma.realizedEntry.deleteMany({ where: { tenantId: { in: toDeleteIds } } });
            await prisma.budgetEntry.deleteMany({ where: { tenantId: { in: toDeleteIds } } });
            await prisma.tenant.deleteMany({ where: { id: { in: toDeleteIds } } });
        }

        return NextResponse.json({ 
            success: true, 
            message: "Limpeza de duplicatas concluída",
            deletedCount: toDeleteIds.length,
            remainingTenants: (await prisma.tenant.findMany()).length
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
