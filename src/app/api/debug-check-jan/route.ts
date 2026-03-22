import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const categories = await prisma.category.findMany({
            where: { name: { contains: '01.1.1' } }
        });

        const catIds = categories.map(c => c.id);

        const entries = await prisma.realizedEntry.findMany({
            where: {
                month: 1,
                year: 2026,
            },
            include: {
                category: true,
                tenant: true
            }
        });

        const total0111 = entries
            .filter(e => e.category.name.includes('01.1.1'))
            .reduce((s, e) => s + e.amount, 0);

        const totalAll = entries.reduce((s, e) => s + e.amount, 0);

        return NextResponse.json({
            count: entries.length,
            total0111,
            totalAll,
            entries: entries.map(e => ({
                id: e.id,
                tenant: e.tenant.name,
                category: e.category.name,
                amount: e.amount,
                description: e.description
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
