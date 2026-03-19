import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const spotId = 'e2079373-f938-4eac-aae3-43edef291129';
    try {
        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId: spotId, year: 2026 },
            orderBy: { month: 'asc' }
        });
        return NextResponse.json({ ok: true, count: entries.length, data: entries });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
