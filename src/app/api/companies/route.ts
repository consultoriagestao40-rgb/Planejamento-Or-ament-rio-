import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Self-healing: Rename the fallback "Minha Empresa (Conta Azul)" to SPOT FACILITIES
        await prisma.tenant.updateMany({
            where: { name: { contains: 'Minha Empresa' } },
            data: { name: 'SPOT FACILITIES' }
        });

        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });
        return NextResponse.json({ success: true, companies: tenants });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
