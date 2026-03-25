import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, taxRate: true }
        });
        const ccs = await prisma.costCenter.findMany({
            where: { name: { contains: 'CONDOR' } },
            select: { id: true, name: true, taxRate: true, tenantId: true }
        });
        return NextResponse.json({ success: true, tenants, ccs });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
