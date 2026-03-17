import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats = await prisma.$queryRaw`
            SELECT "tenantId", count(*), sum(amount) as total 
            FROM "RealizedEntry" 
            WHERE year = 2026 
            GROUP BY "tenantId"
        `;

        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        return NextResponse.json({
            success: true,
            db_distribution: stats,
            active_tenants: tenants
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
