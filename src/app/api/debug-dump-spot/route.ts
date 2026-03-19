import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const spotId = '413f88a7-ce4a-4620-b044-43ef909b7b26';
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
