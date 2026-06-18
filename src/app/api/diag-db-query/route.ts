import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS Tratamentos
        const categories = await prisma.category.findMany({
            where: { tenantId }
        });
        const group5 = categories.filter(c => c.name.startsWith('05.'));
        return NextResponse.json({
            success: true,
            group5: group5.map(c => ({ id: c.id, name: c.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}

