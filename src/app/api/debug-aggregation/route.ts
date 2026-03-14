
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT', mode: 'insensitive' } } });
        
        if (!spot) return NextResponse.json({ success: false, error: 'SPOT not found' });

        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id, month: 0, year: 2026, viewMode: 'competencia' },
            include: { category: true }
        });

        const revenue3s = entries.filter(e => {
            const name = e.category.name || '';
            const code = (name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return (code.startsWith('01') || code.startsWith('1')) && code.split('.').filter(Boolean).length === 3;
        });

        const breakdown = revenue3s.map(e => ({
            id: e.id,
            catId: e.category.id,
            catName: e.category.name,
            amount: e.amount
        }));

        const totalCalculated = revenue3s.reduce((s, e) => s + e.amount, 0);

        return NextResponse.json({ 
            success: true, 
            tenant: spot.name,
            targetJan: 165527.25,
            currentJan: totalCalculated,
            diff: totalCalculated - 165527.25,
            breakdown 
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
