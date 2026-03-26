import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const types = await prisma.category.groupBy({
        by: ['type'],
        _count: true
    });
    
    const sample = await prisma.category.findFirst({
        where: { type: types[0]?.type || '' }
    });

    return NextResponse.json({ types, sample });
}
