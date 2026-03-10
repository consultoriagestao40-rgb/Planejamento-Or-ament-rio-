import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });
        return NextResponse.json({ tenants });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
