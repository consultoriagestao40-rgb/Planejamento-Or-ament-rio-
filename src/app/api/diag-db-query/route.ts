import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const groups = await getTenantGroups();

        return NextResponse.json({
            success: true,
            tenants,
            groups
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
