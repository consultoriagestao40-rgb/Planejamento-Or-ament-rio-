import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        return NextResponse.json({
            success: true,
            tenants: tenants.map(t => ({ id: t.id, name: t.name, cnpj: t.cnpj }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
