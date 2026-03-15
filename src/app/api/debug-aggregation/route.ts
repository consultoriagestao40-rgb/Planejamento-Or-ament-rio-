import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ 
            where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
        });

        if (!spot) return NextResponse.json({ error: "SPOT not found" });

        const categories = await prisma.category.findMany({
            where: { tenantId: spot.id },
            select: { id: true, name: true, type: true, entradaDre: true }
        });

        return NextResponse.json({
            success: true,
            tenant: spot.name,
            categoriesCount: categories.length,
            categories: categories.slice(0, 100) // Sample
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
