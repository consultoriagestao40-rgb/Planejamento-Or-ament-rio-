import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { tenantId } = body;

        if (tenantId) {
            // Delete only the specified tenant's data
            await prisma.budgetEntry.deleteMany({ where: { tenantId } });
            await prisma.costCenter.deleteMany({ where: { tenantId } });
            await prisma.category.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        } else {
            // Delete all tenants and their data
            await prisma.budgetEntry.deleteMany({});
            await prisma.costCenter.deleteMany({});
            await prisma.category.deleteMany({});
            await prisma.tenant.deleteMany({});
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Disconnect failed:", error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to disconnect' }, { status: 500 });
    }
}
