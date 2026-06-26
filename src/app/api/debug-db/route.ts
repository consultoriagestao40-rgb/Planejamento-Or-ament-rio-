import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'query-sql') {
            const sql = searchParams.get('sql');
            if (!sql) {
                return NextResponse.json({ success: false, error: 'SQL query missing' });
            }
            // Execute raw SQL query
            const result = await prisma.$queryRawUnsafe(sql);
            return NextResponse.json({ success: true, result });
        }

        // Default behavior: return basic summary of cost centers
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
        const ccs = await prisma.costCenter.findMany({
            where: { tenantId },
            orderBy: { name: 'asc' }
        });
        
        return NextResponse.json({
            success: true,
            total: ccs.length,
            costCenters: ccs.map(c => ({ id: c.id, name: c.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
