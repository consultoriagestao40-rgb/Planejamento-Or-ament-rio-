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

        // Sum by category
        const catSummary: Record<string, { name: string, total: number, count: number, entries: any[] }> = {};
        realizedEntries.forEach(e => {
            const catId = e.categoryId;
            const catName = e.category?.name || `Unknown (${catId})`;
            if (!catSummary[catId]) {
                catSummary[catId] = { name: catName, total: 0, count: 0, entries: [] };
            }
            catSummary[catId].total += e.amount;
            catSummary[catId].count += 1;
            catSummary[catId].entries.push({
                id: e.id,
                amount: e.amount,
                description: e.description,
                customer: e.customer,
                date: e.date,
                externalId: e.externalId
            });
        });

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            totalEntries: realizedEntries.length,
            categories: Object.values(catSummary).sort((a, b) => a.name.localeCompare(b.name))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
