
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT', mode: 'insensitive' } } });
        const clean = await prisma.tenant.findFirst({ where: { name: { contains: 'Clean', mode: 'insensitive' } } });

        const results: any = { spot: {}, clean: {} };

        if (spot) {
            const entries = await prisma.realizedEntry.findMany({
                where: { tenantId: spot.id, month: 0, year: 2026, viewMode: 'competencia' },
                include: { category: true }
            });
            results.spot = {
                id: spot.id,
                total: entries.reduce((s, e) => s + e.amount, 0),
                revenue3s: entries.filter(e => {
                    const name = e.category.name || '';
                    const code = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                    return (code.startsWith('01') || code.startsWith('1')) && code.split('.').filter(Boolean).length === 3;
                }).map(e => ({ name: e.category.name, amount: e.amount })),
                revenueAll: entries.filter(e => (e.category.name.startsWith('01') || e.category.name.startsWith('1'))).map(e => ({ name: e.category.name, amount: e.amount }))
            };
        }

        if (clean) {
            const entries = await prisma.realizedEntry.findMany({
                where: { tenantId: clean.id, month: 0, year: 2026, viewMode: 'competencia' },
                include: { category: true }
            });
            results.clean = {
                id: clean.id,
                total: entries.reduce((s, e) => s + e.amount, 0),
                revenue3s: entries.filter(e => {
                    const name = e.category.name || '';
                    const code = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                    return (code.startsWith('01') || code.startsWith('1')) && code.split('.').filter(Boolean).length === 3;
                }).map(e => ({ name: e.category.name, amount: e.amount })),
                revenueAll: entries.filter(e => (e.category.name.startsWith('01') || e.category.name.startsWith('1'))).map(e => ({ name: e.category.name, amount: e.amount }))
            };
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
