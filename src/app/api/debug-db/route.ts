import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
        const ccs = await prisma.costCenter.findMany({
            where: { tenantId },
            orderBy: { name: 'asc' }
        });
        
        return NextResponse.json({
            success: true,
            tenantId,
            total: ccs.length,
            costCenters: ccs.map(c => ({ id: c.id, name: c.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
