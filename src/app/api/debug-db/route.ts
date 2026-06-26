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
        
        // Find if Erasto Gaetner is in the list
        const erasto = ccs.find(c => c.name.includes('ERASTO') || c.id.includes('30345fc4'));

        return NextResponse.json({
            success: true,
            total: ccs.length,
            erastoRecord: erasto,
            costCenters: ccs.map(c => ({ id: c.id, name: c.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
