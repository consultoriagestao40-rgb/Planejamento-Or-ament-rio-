import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

const CLEAN_TECH_ID = '1fa165e3-178f-4d8f-ae7c-434c720c82dd';

export async function GET() {
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: CLEAN_TECH_ID,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: {
                category: true
            }
        });

        // Group by category to see the sums
        const grouped: Record<string, { total: number, count: number, items: any[] }> = {};
        for (const e of entries) {
            const catName = e.category.name;
            if (!grouped[catName]) {
                grouped[catName] = { total: 0, count: 0, items: [] };
            }
            grouped[catName].total += e.amount;
            grouped[catName].count += 1;
            grouped[catName].items.push({
                id: e.id,
                amount: e.amount,
                description: e.description,
                externalId: e.externalId,
                date: e.date
            });
        }

        return NextResponse.json({
            success: true,
            totalEntries: entries.length,
            categories: grouped
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
