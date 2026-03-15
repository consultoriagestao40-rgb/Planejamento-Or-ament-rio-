import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spotTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } }
        });
        const ids = spotTenants.map(t => t.id);

        const entries = await prisma.realizedEntry.findMany({
            where: { 
                tenantId: { in: ids }, 
                month: 0, 
                year: 2026, 
                viewMode: 'competencia' 
            },
            include: { category: true }
        });

        // Agrupar por categoria para ver onde está o excesso
        const byCategory: Record<string, { total: number, entries: any[] }> = {};
        entries.forEach(e => {
            const name = e.category.name;
            if (!byCategory[name]) byCategory[name] = { total: 0, entries: [] };
            byCategory[name].total += e.amount;
            byCategory[name].entries.push({ val: e.amount, id: e.categoryId });
        });

        return NextResponse.json({
            summary: {
                grid_total: entries.reduce((s, e) => s + e.amount, 0),
                target: 165527.25,
                excesso: entries.reduce((s, e) => s + e.amount, 0) - 165527.25
            },
            categories: byCategory
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
