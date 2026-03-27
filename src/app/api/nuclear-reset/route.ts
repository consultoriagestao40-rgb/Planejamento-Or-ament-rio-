import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const ccIds = [
            '1fa165e3-178f-4d8f-aa7c-434c720c82dd', // O ID da sua URL atual
            '1fa165e3-178f-4d8f-ae7c-434c720c82dd'  // O ID oficial da Clean Tech
        ];
        
        const deleted = await prisma.budgetEntry.deleteMany({
            where: {
                costCenterId: { in: ccIds },
                year: 2026
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: `SUCESSO ATÔMICO! ${deleted.count} registros fantasmas foram varridos do mapa para a Clean Tech.`,
            clearedIds: ccIds
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
