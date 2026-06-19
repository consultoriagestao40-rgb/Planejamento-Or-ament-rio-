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

        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenant.id,
                year: 2026,
                viewMode: 'competencia'
            },
            include: {
                category: true,
                costCenter: true
            },
            orderBy: {
                amount: 'desc'
            }
        });

        const detailedEntries = entries.map(e => ({
            id: e.id,
            amount: e.amount,
            description: e.description,
            category: e.category.name,
            costCenter: e.costCenter ? e.costCenter.name : 'Nenhum',
            externalId: e.externalId,
            month: e.month
        }));

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            detailedEntries,
            totalCount: entries.length
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
