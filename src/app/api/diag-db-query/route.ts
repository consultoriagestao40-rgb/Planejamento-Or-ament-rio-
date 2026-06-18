import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const cleanTech = tenants.find(t => t.name.toUpperCase().includes('CLEAN TECH'));
        if (!cleanTech) {
            return NextResponse.json({ success: false, error: 'Clean Tech not found', tenants });
        }

        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: cleanTech.id,
                year: 2026,
                month: 5,
                viewMode: 'competencia'
            },
            include: {
                category: true
            }
        });

        // Group by category to see sums
        const categoryGroups: Record<string, { id: string, name: string, amount: number, count: number, entries: any[] }> = {};
        entries.forEach(e => {
            const cat = e.category;
            if (!categoryGroups[cat.id]) {
                categoryGroups[cat.id] = { id: cat.id, name: cat.name, amount: 0, count: 0, entries: [] };
            }
            categoryGroups[cat.id].amount += e.amount;
            categoryGroups[cat.id].count += 1;
            categoryGroups[cat.id].entries.push({
                id: e.id,
                amount: e.amount,
                description: e.description,
                externalId: e.externalId,
                date: e.date
            });
        });

        return NextResponse.json({
            success: true,
            cleanTechId: cleanTech.id,
            totalEntries: entries.length,
            categories: Object.values(categoryGroups).map(cg => ({
                id: cg.id,
                name: cg.name,
                amount: cg.amount,
                count: cg.count,
                allEntries: cg.entries
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
