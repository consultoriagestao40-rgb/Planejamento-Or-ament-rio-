
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            orderBy: { name: 'asc' }
        });
        return NextResponse.json({ success: true, count: tenants.length, tenants });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
