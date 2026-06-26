import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ccs = await prisma.costCenter.findMany({
            orderBy: { name: 'asc' }
        });
        
        const rawCCs = ccs.filter(c => !c.id.includes(':'));
        const prefixedCCs = ccs.filter(c => c.id.includes(':'));
        
        return NextResponse.json({
            success: true,
            total: ccs.length,
            unprefixedCount: rawCCs.length,
            prefixedCount: prefixedCCs.length,
            unprefixed: rawCCs.map(c => ({ id: c.id, name: c.name, tenantId: c.tenantId })),
            prefixed: prefixedCCs.slice(0, 50).map(c => ({ id: c.id, name: c.name, tenantId: c.tenantId }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
