import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const tenants = await prisma.tenant.findMany();
    const stats = await Promise.all(tenants.map(async t => {
        const count = await prisma.realizedEntry.count({
            where: { tenantId: t.id, year: 2026, month: { in: [1, 2] } }
        });
        return { name: t.name, id: t.id, count };
    }));

    return NextResponse.json(stats);
}
