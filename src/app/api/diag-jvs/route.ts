
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const jvs = await prisma.tenant.findMany({
            where: { name: { contains: 'JVS', mode: 'insensitive' } },
            include: {
                categories: {
                    select: {
                        id: true,
                        name: true,
                        entradaDre: true
                    },
                    orderBy: { name: 'asc' }
                }
            }
        });

        return NextResponse.json({ success: true, data: jvs });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
