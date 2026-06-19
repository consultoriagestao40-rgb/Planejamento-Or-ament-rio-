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

        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenant.id,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: {
                category: true
            }
        });

        // Group by category name and prefix
        const categoryGroups: Record<string, { total: number, count: number, type: string, entries: any[] }> = {};
        let totalSum = 0;

        realizedEntries.forEach(e => {
            const catName = e.category.name;
            const catType = e.category.type;
            if (!categoryGroups[catName]) {
                categoryGroups[catName] = { total: 0, count: 0, type: catType, entries: [] };
            }
            categoryGroups[catName].total += e.amount;
            categoryGroups[catName].count += 1;
            categoryGroups[catName].entries.push({
                id: e.id,
                amount: e.amount,
                description: e.description,
                customer: e.customer,
                date: e.date,
                externalId: e.externalId
            });
            totalSum += e.amount;
        });

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            totalEntries: realizedEntries.length,
            totalSum,
            categoryGroups
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
