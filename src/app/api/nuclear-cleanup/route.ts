import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId');
    const year = parseInt(url.searchParams.get('year') || '2026');
    const month = parseInt(url.searchParams.get('month') || '1');

    if (!tenantId || tenantId !== '413f88a7-ce4a-4620-b044-43ef909b7b26') {
        return NextResponse.json({ error: 'Tenant ID is required and must be SPOT FACILITIES' }, { status: 400 });
    }

    try {
        const deleted = await prisma.realizedEntry.deleteMany({
            where: {
                tenantId,
                year,
                month
            }
        });

        return NextResponse.json({
            success: true,
            message: `Deleted ${deleted.count} entries for SPOT in ${month}/${year}`,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
