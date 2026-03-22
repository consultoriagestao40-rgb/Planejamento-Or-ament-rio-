import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const yearStats = await prisma.budgetEntry.groupBy({
            by: ['year'],
            _count: true
        });

        const mrvTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'MRV', mode: 'insensitive' } }
        });

        const spotTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } }
        });

        return NextResponse.json({ 
            success: true, 
            yearStats,
            tenants: {
                mrv: mrvTenants.map(t => t.name),
                spot: spotTenants.map(t => t.name)
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
