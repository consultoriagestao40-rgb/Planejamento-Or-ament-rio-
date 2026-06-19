import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Clean Tech Tenant not found' });
        }

        const summary = await prisma.realizedEntry.groupBy({
            by: ['year', 'month', 'viewMode'],
            _count: {
                id: true
            },
            _sum: {
                amount: true
            },
            orderBy: [
                { year: 'desc' },
                { month: 'desc' }
            ]
        });

        // Also query the category group totals for any year/month where sum matches or target exists
        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            summary
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
