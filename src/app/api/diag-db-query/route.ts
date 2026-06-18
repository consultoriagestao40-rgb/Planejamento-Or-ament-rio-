import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT FACILITIES
        const categories = await prisma.category.findMany({
            where: { tenantId },
            take: 20
        });
        
        return NextResponse.json({
            success: true,
            categories
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
