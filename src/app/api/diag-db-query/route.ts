import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT FACILITIES

        const categories = await prisma.category.findMany();
        const costCenters = await prisma.costCenter.findMany({
            where: { tenantId }
        });
        const realizedEntries = await prisma.realizedEntry.findMany({
            where: { tenantId, year: 2026, month: 5 }
        });

        return NextResponse.json({
            success: true,
            tenantId,
            categoriesCount: categories.length,
            categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type, entradaDre: c.entradaDre })),
            costCentersCount: costCenters.length,
            costCenters: costCenters.map(cc => ({ id: cc.id, name: cc.name })),
            realizedEntriesCount: realizedEntries.length,
            realizedEntries
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
