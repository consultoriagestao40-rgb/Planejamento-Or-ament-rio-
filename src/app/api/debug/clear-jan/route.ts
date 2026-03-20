import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const tenantId = '413f88aa-8e4a-4b20-b044-d36f90937b26'; // SPOT FACILITIES
        const result = await prisma.realizedEntry.deleteMany({
            where: {
                tenantId,
                month: 1,
                year: 2026
            }
        });

        return NextResponse.json({
            success: true,
            message: `Limpeza concluída! ${result.count} registros de Janeiro/2026 foram removidos para a SPOT FACILITIES.`,
            tenantId
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
