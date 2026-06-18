import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities

        // 1. Fetch categories
        const categories = await prisma.category.findMany();

        // 2. Fetch cost centers
        const costCenters = await prisma.costCenter.findMany({
            where: { tenantId }
        });

        // 3. Fetch realized entries for May 2026
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
