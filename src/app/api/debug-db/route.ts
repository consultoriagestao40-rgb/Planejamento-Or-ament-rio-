import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ccs = ["Associação da Galeria General Osório", "DAJU PARANAGUA", "DAJU AGUA VERDE ADM", "LUNARDON E MEDEIROS ADVOGADOS ASSOCIADOS"];
        
        const found = await prisma.costCenter.findMany({
            where: {
                name: { in: ccs }
            },
            include: { tenant: true }
        });

        return NextResponse.json({
            success: true,
            found: found.map(c => ({ name: c.name, tenantId: c.tenantId, tenantName: c.tenant.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
