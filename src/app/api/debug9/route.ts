import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ccs = await prisma.costCenter.findMany({
            take: 20,
            select: { id: true, name: true, tenantId: true }
        });
        
        const categories = await prisma.category.findMany({
            take: 20,
            select: { id: true, name: true, tenantId: true }
        });

        const realizedSample = await prisma.realizedEntry.findMany({
            take: 5
        });

        return NextResponse.json({
            cc_ids: ccs.map(c => ({ id: c.id, name: c.name })),
            cat_ids: categories.map(c => ({ id: c.id, name: c.name })),
            realized_sample: realizedSample
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
