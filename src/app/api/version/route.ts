import { NextResponse } from 'next/server';
// Trigger v66.24 build retry

import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const categories = await prisma.category.findMany({
            where: { tenantId: 'dc2b6eed-a38a-43c3-9465-ce854bfda90f' },
            select: { id: true, name: true, entradaDre: true }
        });
        return NextResponse.json({ success: true, categories });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}

