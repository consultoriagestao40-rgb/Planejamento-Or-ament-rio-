import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ 
            where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
        });

        if (!spot) return NextResponse.json({ error: "SPOT not found" });

        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id, year: 2026, viewMode: 'caixa' }
        });

        const total2026 = entries.reduce((s, e) => s + e.amount, 0); // Note: amounts in DB are already signed? No, code used abs then applied sign-flag. Let's check.
        
        return NextResponse.json({
            success: true,
            tenant: spot.name,
            totalCaixa2026: total2026,
            entriesCount: entries.length,
            januarySum: entries.filter(e => e.month === 1).reduce((s, e) => s + e.amount, 0)
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
