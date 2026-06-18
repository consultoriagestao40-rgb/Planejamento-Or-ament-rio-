import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const costCenters = await prisma.costCenter.findMany({
            where: { tenantId }
        });
        
        return NextResponse.json({
            success: true,
            count: costCenters.length,
            costCenters: costCenters.map(cc => ({
                id: cc.id,
                name: cc.name
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
